App({
  globalData: {
    userInfo: null,
    serverUrl: 'http://localhost:3000' // 开发环境，部署时需要修改为正式域名
  },

  onLaunch() {
    // 获取用户信息
    this.getUserInfo();
    
    // 连接WebSocket
    this.connectWebSocket();
  },

  getUserInfo() {
    const that = this;
    
    // 获取用户信息
    wx.getUserProfile({
      desc: '用于显示用户身份',
      success: (res) => {
        that.globalData.userInfo = res.userInfo;
        wx.setStorageSync('userInfo', res.userInfo);
      },
      fail: () => {
        // 如果获取失败，尝试从缓存读取
        const userInfo = wx.getStorageSync('userInfo');
        if (userInfo) {
          that.globalData.userInfo = userInfo;
        }
      }
    });
  },

  connectWebSocket() {
    const that = this;
    
    wx.connectSocket({
      url: 'ws://localhost:3000', // WebSocket地址
      success: () => {
        console.log('WebSocket连接成功');
      },
      fail: (error) => {
        console.error('WebSocket连接失败', error);
      }
    });

    wx.onSocketOpen(() => {
      console.log('WebSocket连接已打开');
    });

    wx.onSocketMessage((res) => {
      try {
        const data = JSON.parse(res.data);
        that.handleWebSocketMessage(data);
      } catch (error) {
        console.error('WebSocket消息解析失败', error);
      }
    });

    wx.onSocketError((error) => {
      console.error('WebSocket错误', error);
    });

    wx.onSocketClose(() => {
      console.log('WebSocket连接关闭');
      // 尝试重连
      setTimeout(() => {
        that.connectWebSocket();
      }, 5000);
    });
  },

  handleWebSocketMessage(data) {
    console.log('收到WebSocket消息', data);
    
    switch (data.type) {
      case 'status_update':
        // 状态更新，通知所有页面刷新
        this.notifyPagesRefresh();
        break;
      case 'usage_completed':
        // 使用完成，显示通知
        wx.showToast({
          title: data.data.message,
          icon: 'success',
          duration: 3000
        });
        this.notifyPagesRefresh();
        break;
      case 'reservation_made':
        // 预约成功
        wx.showToast({
          title: '有新的预约',
          icon: 'none',
          duration: 2000
        });
        this.notifyPagesRefresh();
        break;
    }
  },

  notifyPagesRefresh() {
    // 获取当前页面栈
    const pages = getCurrentPages();
    pages.forEach(page => {
      if (page.onRefresh && typeof page.onRefresh === 'function') {
        page.onRefresh();
      }
    });
  },

  // 工具函数：发起API请求
  request(options) {
    const that = this;
    
    return new Promise((resolve, reject) => {
      wx.request({
        url: that.globalData.serverUrl + options.url,
        method: options.method || 'GET',
        data: options.data || {},
        header: {
          'content-type': 'application/json'
        },
        success: (res) => {
          if (res.data.success) {
            resolve(res.data.data);
          } else {
            reject(new Error(res.data.error || '请求失败'));
          }
        },
        fail: (error) => {
          reject(error);
        }
      });
    });
  }
}); 