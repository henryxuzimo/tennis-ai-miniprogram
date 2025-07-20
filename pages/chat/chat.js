const util = require('../../utils/util.js');

Page({
  data: {
    messages: [
      { sender: 'bot', text: '你好！我是你的网球智能助理。有什么可以帮你的吗？' }
    ],
    inputValue: '',
  },

  onSuggestionTap(e) {
    const text = e.currentTarget.dataset.text;
    this.setData({
      inputValue: text
    }, () => {
      this.sendMessage();
    });
  },

  onInput(e) {
    this.setData({
      inputValue: e.detail.value
    });
  },

  sendMessage() {
    if (this.data.inputValue.trim() === '') {
      return;
    }

    const messages = this.data.messages.concat({
      sender: 'user',
      text: this.data.inputValue
    });

    this.setData({
      messages,
      inputValue: ''
    });

    this.getBotReply(messages);
  },

  getBotReply(history) {
    const thinkingMessage = { sender: 'bot', text: '正在思考...' };
    const messages = this.data.messages.concat(thinkingMessage);
    const thinkingMessageIndex = messages.length - 1;

    this.setData({
      messages: messages
    });

    const userMessages = history.filter(m => m.sender === 'user');
    const lastUserMessage = userMessages.pop();

    const chatHistory = history
        .slice(1, -1) // Remove the very first welcome message and the last user message
        .filter(m => m.text !== '正在思考...')
        .map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text
        }));
    
    if (lastUserMessage.text === '寻找附近球场') {
      wx.getLocation({
        type: 'wgs84',
        success: (res) => {
          const { latitude, longitude } = res;
          const queryWithLocation = `${lastUserMessage.text} (我的地理位置：纬度${latitude}，经度${longitude})`;
          this.performChatRequest(queryWithLocation, chatHistory, thinkingMessageIndex);
        },
        fail: (err) => {
          console.error("获取地理位置失败", err);
          this.updateMessage(thinkingMessageIndex, '获取地理位置失败，请检查小程序权限设置。');
        }
      });
    } else {
      this.performChatRequest(lastUserMessage.text, chatHistory, thinkingMessageIndex);
    }
  },
  
  performChatRequest(query, chatHistory, thinkingMessageIndex) {
    const apiUrl = 'http://111.230.81.138:3000/chat';

    let fullReply = '';
    let isFirstChunk = true;
    let buffer = ''; // Buffer to hold incomplete stream data

    const requestTask = wx.request({
      url: apiUrl,
      method: 'POST',
      header: {
        'content-type': 'application/json'
      },
      data: {
        query: query,
        user: "wechat_user_id",
        chat_history: chatHistory
      },
      responseType: 'text',
      enableChunked: true,
      success: (res) => {
        if (res.statusCode !== 200) {
          this.updateMessage(thinkingMessageIndex, `请求出错: ${res.statusCode}`);
        } else {
          // Stream is done, remove the trailing ellipsis from the final message
          const finalMessages = this.data.messages;
          if (finalMessages[thinkingMessageIndex] && finalMessages[thinkingMessageIndex].text.endsWith('...')) {
            finalMessages[thinkingMessageIndex].text = finalMessages[thinkingMessageIndex].text.slice(0, -3);
            this.setData({ messages: finalMessages });
          }
        }
      },
      fail: (err) => {
        console.error('Request failed', err);
        this.updateMessage(thinkingMessageIndex, `请求失败: ${err.errMsg}`);
      }
    });

    requestTask.onChunkReceived((res) => {
        // Append new data to a buffer
        buffer += util.utf8ArrayBufferToString(res.data);
        
        // Split the buffer by the SSE message delimiter "\n\n"
        const messageBlocks = buffer.split('\n\n');
        
        // The last item might be an incomplete message, so we put it back into the buffer
        buffer = messageBlocks.pop() || ''; 

        for (const block of messageBlocks) {
            if (!block.startsWith('data:')) {
                continue;
            }

            const jsonData = block.substring(5).trim();
            if (jsonData.length === 0 || jsonData === '[DONE]') {
                continue;
            }

            try {
                const parsedData = JSON.parse(jsonData);
                
                if (parsedData.event === 'done') {
                    return; // End of stream signal from Coze
                }
                
                if (parsedData.message && parsedData.message.type === 'answer') {
                    const content = parsedData.message.content;
                    if (isFirstChunk && content.trim().length > 0) {
                        fullReply = content;
                        isFirstChunk = false;
                    } else {
                        fullReply += content;
                    }
                    // Update the UI with the latest content and an ellipsis to show it's streaming
                    this.updateMessage(thinkingMessageIndex, fullReply + '...');
                }
            } catch (e) {
                // This might happen if a non-JSON message is sent, we can safely ignore it.
                console.error('Could not parse a chunk of stream data:', jsonData);
            }
        }
    });
  },

  updateMessage(index, text) {
    const messages = this.data.messages;
    messages[index].text = text;
    this.setData({
        messages
    });
  }
}); 