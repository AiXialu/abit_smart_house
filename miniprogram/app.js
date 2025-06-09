App({
  globalData: {
    userInfo: null,
    userId: null,
    serverUrl: '', // 在onLaunch中动态设置
    shareData: null // 添加分享数据存储
  },

  onLaunch() {
    // 设置服务器地址
    this.globalData.serverUrl = this.getServerUrl();
    console.log('服务器地址设置为:', this.globalData.serverUrl);
    
    // 检查是否有缓存的用户信息
    this.loadCachedUserInfo();
    
    // 连接WebSocket
    this.connectWebSocket();
  },

  // 动态获取服务器地址
  getServerUrl() {
    try {
      // 获取系统信息
      const systemInfo = wx.getSystemInfoSync();
      console.log('系统信息:', systemInfo);
      
      // 如果是开发者工具环境，使用localhost
      if (systemInfo.platform === 'devtools') {
        console.log('检测到开发者工具环境，使用localhost');
        return 'http://localhost:3000';
      }
      
      // 真机环境：尝试多个可能的IP地址
      console.log('检测到真机环境，尝试局域网IP地址');
      
      // 根据网络情况选择合适的IP
      // 优先使用局域网IP
      return 'http://10.93.199.165:3000';  // 新的WiFi网络IP
      
    } catch (error) {
      console.error('获取系统信息失败，使用备用IP:', error);
      return 'http://10.93.199.165:3000';
    }
  },

  // 加载缓存的用户信息（不自动调用微信API）
  loadCachedUserInfo() {
    try {
      const cachedUserInfo = wx.getStorageSync('userInfo');
      if (cachedUserInfo) {
        // 检查是否是脱敏数据
        const isDemoted = cachedUserInfo.is_demote === true || 
                         cachedUserInfo.nickName === '微信用户' || 
                         cachedUserInfo.nickName === '用户';
        
        // 如果没有isAnonymous字段或者检测到脱敏数据，需要更新标记
        if (cachedUserInfo.isAnonymous === undefined || isDemoted) {
          cachedUserInfo.isAnonymous = true;
          if (isDemoted) {
            cachedUserInfo.isDemoted = true;
          }
          // 更新缓存
          wx.setStorageSync('userInfo', cachedUserInfo);
        }
        
        this.globalData.userInfo = cachedUserInfo;
        this.globalData.userId = cachedUserInfo.nickName || cachedUserInfo.userId;
        console.log('加载缓存的用户信息:', cachedUserInfo);
        console.log('用户昵称:', cachedUserInfo.nickName, '是否匿名:', cachedUserInfo.isAnonymous, '是否脱敏:', cachedUserInfo.isDemoted);
      } else {
        console.log('没有缓存的用户信息，等待用户主动授权');
        // 创建临时匿名用户，但不保存到缓存
        this.createTemporaryAnonymousUser();
      }
    } catch (error) {
      console.error('加载缓存用户信息失败:', error);
      this.createTemporaryAnonymousUser();
    }
  },

  // 创建临时匿名用户（不保存到缓存）
  createTemporaryAnonymousUser() {
    const randomNum = Math.floor(Math.random() * 1000);
    const temporaryUser = {
      nickName: `游客${randomNum}`,
      avatarUrl: '',
      isAnonymous: true,
      isTemporary: true  // 标记为临时用户
    };
    
    this.globalData.userInfo = temporaryUser;
    this.globalData.userId = temporaryUser.nickName;
    console.log('创建临时用户:', temporaryUser);
  },

  // 清除用户信息缓存（供重新授权使用）
  clearUserCache() {
    wx.removeStorageSync('userInfo');
    this.globalData.userInfo = null;
    this.globalData.userId = null;
    console.log('用户信息缓存已清除');
  },

  // 手动获取用户信息（供页面调用）
  requestUserInfo() {
    return new Promise((resolve, reject) => {
      // 如果已有真实用户信息（非匿名），直接返回
      if (this.globalData.userInfo && !this.globalData.userInfo.isAnonymous) {
        resolve(this.globalData.userInfo);
        return;
      }

      // 尝试获取真实的微信用户信息
      wx.getUserProfile({
        desc: '用于显示用户身份和使用记录',
        success: (res) => {
          console.log('获取真实用户信息成功:', res.userInfo);
          
          // 更新全局数据
          this.globalData.userInfo = {
            ...res.userInfo,
            isAnonymous: false  // 确保标记为非匿名
          };
          this.globalData.userId = res.userInfo.nickName;
          
          // 更新缓存，覆盖之前的匿名用户信息
          wx.setStorageSync('userInfo', this.globalData.userInfo);
          
          resolve(this.globalData.userInfo);
        },
        fail: (error) => {
          console.log('用户拒绝授权或获取失败:', error);
          
          // 如果没有任何用户信息，创建匿名用户
          if (!this.globalData.userInfo) {
            this.createAnonymousUser();
          }
          
          reject(new Error('用户拒绝授权或获取失败'));
        }
      });
    });
  },

  connectWebSocket() {
    const that = this;
    
    // 动态获取WebSocket地址
    const wsUrl = this.getWebSocketUrl();
    
    wx.connectSocket({
      url: wsUrl,
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

  // 获取WebSocket地址
  getWebSocketUrl() {
    try {
      const systemInfo = wx.getSystemInfoSync();
      
      if (systemInfo.platform === 'devtools') {
        console.log('WebSocket使用localhost');
        return 'ws://localhost:3000';
      }
      
      console.log('WebSocket使用局域网IP');
      return 'ws://10.93.199.165:3000';
    } catch (error) {
      console.error('获取WebSocket地址失败，使用备用IP:', error);
      return 'ws://10.93.199.165:3000';
    }
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
      case 'in_app_notification':
        // 小程序内通知
        this.handleInAppNotification(data.data);
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

  // 处理小程序内通知
  handleInAppNotification(notification) {
    // 显示通知弹窗
    wx.showModal({
      title: '📢 洗衣机通知',
      content: notification.message,
      confirmText: '知道了',
      showCancel: false
    });

    // 保存通知到本地
    const notifications = wx.getStorageSync('notifications') || [];
    notifications.unshift({
      id: notification.id || Date.now(),
      message: notification.message,
      type: notification.type || 'general',
      timestamp: notification.timestamp || new Date().toISOString(),
      read: false
    });

    // 只保留最近50条通知
    if (notifications.length > 50) {
      notifications.splice(50);
    }

    wx.setStorageSync('notifications', notifications);

    // 更新页面的未读数量
    this.notifyPagesRefresh();
  },

  // 工具函数：发起API请求
  request(options) {
    const that = this;
    
    return new Promise((resolve, reject) => {
      const requestUrl = that.globalData.serverUrl + options.url;
      console.log('发起请求:', requestUrl);
      console.log('请求参数:', options);
      
      wx.request({
        url: requestUrl,
        method: options.method || 'GET',
        data: options.data || {},
        header: {
          'content-type': 'application/json'
        },
        success: (res) => {
          console.log('请求成功，响应状态:', res.statusCode);
          console.log('响应数据:', res.data);
          
          if (res.statusCode === 200) {
            if (res.data && res.data.success) {
              resolve(res.data.data);
            } else {
              const errorMsg = res.data ? res.data.error || '服务器返回错误' : '响应数据格式错误';
              console.error('服务器错误:', errorMsg);
              reject(new Error(errorMsg));
            }
          } else {
            console.error('HTTP错误:', res.statusCode);
            reject(new Error(`HTTP错误: ${res.statusCode}`));
          }
        },
        fail: (error) => {
          console.error('请求失败:', error);
          reject(new Error(`网络请求失败: ${error.errMsg || '未知错误'}`));
        }
      });
    });
  }
}); 