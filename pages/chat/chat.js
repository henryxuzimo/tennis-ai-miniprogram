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
    const apiUrl = 'http://47.113.145.213:3000/chat';

    const thinkingMessage = { sender: 'bot', text: '正在思考...' };
    const messages = this.data.messages.concat(thinkingMessage);
    const thinkingMessageIndex = messages.length - 1;

    this.setData({
      messages: messages
    });

    const userMessages = history.filter(m => m.sender === 'user');
    const lastUserMessage = userMessages.pop();

    const chatHistory = history
        .slice(1, -1)
        .filter(m => m.text !== '正在思考...')
        .map(m => ({
            role: m.sender === 'user' ? 'user' : 'assistant',
            content: m.text
        }));

    let fullReply = '';
    let isFirstChunk = true;

    const requestTask = wx.request({
      url: apiUrl,
      method: 'POST',
      data: {
        query: lastUserMessage.content,
        chat_history: chatHistory,
        user: 'miniprogram_user_id'
      },
      enableChunked: true,
      success: (res) => {
        if (res.statusCode !== 200) {
          this.updateMessage(thinkingMessageIndex, `请求出错: ${res.statusCode}`);
        }
      },
      fail: (err) => {
        console.error('Request failed', err);
        this.updateMessage(thinkingMessageIndex, `请求失败: ${err.errMsg}`);
      }
    });

    requestTask.onChunkReceived((res) => {
        const chunk = new Uint8Array(res.data);
        const chunkText = new TextDecoder('utf-8').decode(chunk);

        // Process SSE data
        const lines = chunkText.split('\\n\\n');
        lines.forEach(line => {
            if (line.startsWith('data:')) {
                try {
                    const jsonData = line.substring(5);
                    const parsedData = JSON.parse(jsonData);
                    if (parsedData.message && parsedData.message.type === 'answer') {
                        const content = parsedData.message.content;
                        if (isFirstChunk) {
                            fullReply = content;
                            this.updateMessage(thinkingMessageIndex, fullReply);
                            isFirstChunk = false;
                        } else {
                            fullReply += content;
                            this.updateMessage(thinkingMessageIndex, fullReply);
                        }
                    } else if (parsedData.event === 'done') {
                        // Stream finished
                    }
                } catch (e) {
                    // JSON parsing error or other issue
                }
            }
        });
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