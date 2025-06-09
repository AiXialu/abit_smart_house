const app = getApp();

Page({
  data: {
    status: {
      status: 'idle',
      current_user_name: null,
      start_time: null,
      estimated_end_time: null,
      updated_at: null
    },
    reservations: [],
    isCurrentUser: false,
    userInfo: null,
    hasUserInfo: false,
    reminderEnabled: false,
    showNotifyModal: false,
    // 网络状态
    networkStatus: 'connecting', // 'connecting', 'online', 'offline'
    // 群聊设置
    targetGroups: [], // 预设的目标群列表
    defaultGroupId: '', // 默认群ID
    hasGroupSetting: false, // 是否已设置群
    // @人员管理
    commonMembers: [], // 常用@人员列表
    atMode: 'all', // @模式：'all'(@所有人), 'specific'(@特定人), 'none'(不@人)
    // 小程序内通知系统
    isSubscribed: false, // 是否订阅通知
    onlineUsers: [], // 在线用户列表
    notifications: [], // 通知历史
    unreadCount: 0, // 未读通知数
    // 群组系统
    currentGroup: null, // 当前群组信息
    groupMembers: [], // 群组成员列表
    selectedMembers: [], // 发送通知时选中的成员
    isGroupOwner: false, // 是否是群主
    showMemberSelector: false, // 是否显示成员选择器
    notifyTemplates: {
      statusIdle: '@所有人 🧺洗衣机现在是空闲状态，可以使用～',
      statusInUse: '@所有人 🧺洗衣机正在使用中，使用者：{userName}，预计{remainingTime}后完成',
      askWhenFinish: '@{userName} 有人想用洗衣机，你大概还需要多久呢？🤔',
      washingStarted: '@所有人 🧺洗衣机开始使用，预计{duration}分钟后完成，使用者：{userName}',
      washingFinished: '@所有人 ✅洗衣机使用完成，现在可以使用了～刚才使用者：{userName}'
    },
    currentNotifyMode: 'copy' // 记录当前通知模式
  },

  onLoad(options) {
    console.log('页面加载开始...', options);
    this.checkUserInfo();
    
    // 先加载用户设置
    this.loadUserSettings();
    
    // 处理邀请链接
    if (options.action === 'join' && options.groupId) {
      this.handleGroupInvite(options);
    }
    
    // 测试网络连接，失败时自动启用离线模式
    this.testNetworkConnection();
  },

  onShow() {
    this.checkUserInfo();
    this.loadStatus();
  },

  // 检查用户信息
  checkUserInfo() {
    const userInfo = app.globalData.userInfo;
    this.setData({
      userInfo: userInfo,
      hasUserInfo: !!userInfo
    });
  },

  // 加载用户设置
  loadUserSettings() {
    const reminderEnabled = wx.getStorageSync('reminderEnabled') || false;
    const targetGroups = wx.getStorageSync('targetGroups') || [];
    const defaultGroupId = wx.getStorageSync('defaultGroupId') || '';
    const commonMembers = wx.getStorageSync('commonMembers') || [];
    const atMode = wx.getStorageSync('atMode') || 'all';
    const isSubscribed = wx.getStorageSync('isSubscribed') !== false; // 默认订阅
    const notifications = wx.getStorageSync('notifications') || [];
    const currentGroup = wx.getStorageSync('currentGroup') || null;
    
    this.setData({ 
      reminderEnabled,
      targetGroups,
      defaultGroupId,
      hasGroupSetting: targetGroups.length > 0,
      commonMembers,
      atMode,
      isSubscribed,
      notifications,
      unreadCount: notifications.filter(n => !n.read).length,
      currentGroup
    });
    
    // 如果有当前群组，加载群组成员
    if (currentGroup) {
      console.log('发现已保存的群组，准备加载成员:', currentGroup);
      // 延迟加载，避免网络连接还未建立
      setTimeout(() => {
        this.loadGroupMembers();
      }, 1000);
    }
    
    // 暂时注释掉网络调用，避免域名校验问题
    // this.loadOnlineUsers();
    
    console.log('用户设置加载完成:', {
      hasGroup: !!currentGroup,
      groupName: currentGroup?.name,
      hasGroupSetting: targetGroups.length > 0
    });
  },

  // 获取用户信息
  async getUserInfo() {
    console.log('=== 开始获取用户信息 ===');
    console.log('当前用户信息:', this.data.userInfo);
    
    // 检查基础库版本
    const systemInfo = wx.getSystemInfoSync();
    console.log('系统信息:', {
      platform: systemInfo.platform,
      version: systemInfo.version,
      SDKVersion: systemInfo.SDKVersion
    });
    
    // 检查getUserProfile是否可用
    if (!wx.getUserProfile) {
      console.error('当前环境不支持getUserProfile接口');
      wx.showModal({
        title: '⚠️ 版本不支持',
        content: '当前微信版本不支持获取用户信息\n\n请升级到微信7.0.9以上版本',
        confirmText: '知道了',
        showCancel: false
      });
      return;
    }
    
    try {
      // 如果当前是匿名用户，先清除缓存
      if (this.data.userInfo && this.data.userInfo.isAnonymous) {
        console.log('检测到匿名用户，清除缓存');
        app.clearUserCache();
      }
      
      // 显示授权提示
      const confirmResult = await new Promise((resolve) => {
        wx.showModal({
          title: '🔐 获取微信信息',
          content: '需要获取您的微信昵称用于群组显示\n\n点击"授权"后请在弹出窗口中同意授权',
          confirmText: '立即授权',
          cancelText: '稍后',
          success: (res) => resolve(res)
        });
      });
      
      if (!confirmResult.confirm) {
        throw new Error('用户取消授权');
      }
      
      console.log('用户同意授权，开始调用getUserProfile...');
      
      // 直接调用微信API获取用户信息
      const userProfileResult = await new Promise((resolve, reject) => {
        wx.getUserProfile({
          desc: '用于显示用户身份和群组管理',
          success: (res) => {
            console.log('getUserProfile成功:', res);
            resolve(res);
          },
          fail: (error) => {
            console.error('getUserProfile失败:', error);
            reject(error);
          }
        });
      });
      
      console.log('获取到的用户信息:', userProfileResult.userInfo);
      
      // 验证获取到的用户信息
      if (!userProfileResult.userInfo || !userProfileResult.userInfo.nickName) {
        throw new Error('获取到的用户信息不完整');
      }
      
      // 检查是否是微信的脱敏数据
      const userInfo = userProfileResult.userInfo;
      const isDemoted = userInfo.is_demote === true || userInfo.nickName === '微信用户';
      
      console.log('用户信息检测结果:', {
        nickName: userInfo.nickName,
        is_demote: userInfo.is_demote,
        isDemoted: isDemoted
      });
      
      if (isDemoted) {
        // 微信返回的是脱敏数据，说明在开发环境或其他限制下
        wx.showModal({
          title: '⚠️ 获取到脱敏数据',
          content: `微信返回了匿名数据：${userInfo.nickName}\n\n原因可能是：\n• 开发者工具环境限制\n• 小程序未发布到正式环境\n• 微信版本限制\n\n建议在真机上测试`,
          confirmText: '继续使用',
          cancelText: '稍后',
          success: (res) => {
            if (res.confirm) {
              // 用户选择继续使用脱敏数据，标记为匿名
              const anonymousUser = {
                ...userInfo,
                isAnonymous: true,
                isDemoted: true  // 标记为脱敏数据
              };
              
              app.globalData.userInfo = anonymousUser;
              app.globalData.userId = anonymousUser.nickName;
              wx.setStorageSync('userInfo', anonymousUser);
              
              this.setData({
                userInfo: anonymousUser,
                hasUserInfo: true
              });
              
              console.log('已保存脱敏用户信息:', anonymousUser);
            }
          }
        });
        return; // 退出当前流程
      }
      
      // 手动构建用户信息对象（真实数据）
      const realUserInfo = {
        nickName: userProfileResult.userInfo.nickName,
        avatarUrl: userProfileResult.userInfo.avatarUrl,
        gender: userProfileResult.userInfo.gender,
        country: userProfileResult.userInfo.country,
        province: userProfileResult.userInfo.province,
        city: userProfileResult.userInfo.city,
        language: userProfileResult.userInfo.language,
        isAnonymous: false  // 明确标记为非匿名
      };
      
      console.log('构建的用户信息对象:', realUserInfo);
      
      // 更新应用全局数据
      app.globalData.userInfo = realUserInfo;
      app.globalData.userId = realUserInfo.nickName;
      
      // 更新本地缓存
      wx.setStorageSync('userInfo', realUserInfo);
      
      // 更新页面数据
      this.setData({
        userInfo: realUserInfo,
        hasUserInfo: true
      });
      
      console.log('用户信息更新完成，最终昵称:', realUserInfo.nickName);
      
      wx.showModal({
        title: '✅ 授权成功',
        content: `已获取微信信息\n\n昵称：${realUserInfo.nickName}\n\n现在可以使用真实昵称创建和管理群组了！`,
        confirmText: '知道了',
        showCancel: false
      });
      
    } catch (error) {
      console.error('获取用户信息失败:', error);
      
      // 详细的错误信息
      let errorMsg = error.message || '未知错误';
      let errorDetails = '';
      
      if (error.errMsg) {
        if (error.errMsg.includes('cancel')) {
          errorMsg = '用户取消授权';
          errorDetails = '您取消了授权，将继续使用匿名身份';
        } else if (error.errMsg.includes('fail')) {
          errorMsg = '授权失败';
          errorDetails = `微信API调用失败：${error.errMsg}`;
        }
      }
      
      wx.showModal({
        title: '❌ 授权失败',
        content: `获取微信信息失败：${errorMsg}\n\n${errorDetails}\n\n可能原因：\n• 用户拒绝授权\n• 网络连接问题\n• 微信API限制\n• 开发者工具环境限制\n\n您可以继续以匿名方式使用`,
        confirmText: '知道了',
        showCancel: false
      });
      
      // 确保有匿名用户信息
      if (!this.data.userInfo) {
        const anonymousUser = {
          nickName: `匿名用户${Math.floor(Math.random() * 1000)}`,
          avatarUrl: '',
          isAnonymous: true
        };
        
        this.setData({
          userInfo: anonymousUser,
          hasUserInfo: true
        });
        
        app.globalData.userInfo = anonymousUser;
        app.globalData.userId = anonymousUser.nickName;
      }
    }
  },

  // 实现刷新功能供WebSocket调用
  onRefresh() {
    this.loadStatus();
  },

  // 加载洗衣机状态
  async loadStatus() {
    try {
      const data = await app.request({
        url: '/api/status'
      });
      
      this.setData({
        status: data,
        reservations: data.reservations || [],
        isCurrentUser: this.checkIsCurrentUser(data)
      });
      
    } catch (error) {
      console.error('加载状态失败', error);
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    }
  },

  // 刷新状态
  refreshStatus() {
    wx.showLoading({ title: '刷新中...' });
    this.loadStatus().finally(() => {
      wx.hideLoading();
    });
  },

  // 检查是否是当前使用者
  checkIsCurrentUser(status) {
    const userInfo = this.data.userInfo;
    if (!userInfo || !status.current_user_id) {
      return false;
    }
    return userInfo.nickName === status.current_user_name;
  },

  // 显示通知选项
  showNotifyOptions(e) {
    // 获取通知模式
    const mode = e?.currentTarget?.dataset?.mode || 'copy';
    this.setData({ 
      showNotifyModal: true,
      currentNotifyMode: mode // 记录当前通知模式
    });
  },

  // 隐藏通知选项
  hideNotifyModal() {
    this.setData({ showNotifyModal: false });
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 阻止点击模态框内容时关闭
  },

  // 通知当前状态 - 根据模式选择发送方式
  notifyCurrentStatus() {
    const { status, notifyTemplates, currentNotifyMode } = this.data;
    let message = '';
    
    if (status.status === 'idle') {
      message = notifyTemplates.statusIdle;
    } else if (status.status === 'in_use') {
      const remainingTime = this.getRemainingTime(status.estimated_end_time);
      message = notifyTemplates.statusInUse
        .replace('{userName}', status.current_user_name)
        .replace('{remainingTime}', remainingTime);
    }
    
    // 根据通知模式选择发送方式
    if (currentNotifyMode === 'in-app') {
      // 小程序内通知，去掉@符号
      const cleanMessage = message.replace(/@所有人\s*/, '').replace(/@\w+\s*/g, '');
      this.sendInAppNotification(cleanMessage, '洗衣机状态通知');
    } else if (currentNotifyMode === 'share') {
      // 微信分享
      this.shareCurrentStatus(message);
    } else {
      // 传统群消息，根据@模式处理消息
      message = this.processAtMessage(message);
      this.shareToGroup(message, '洗衣机状态通知');
    }
    
    this.hideNotifyModal();
  },

  // 询问还需多久 - 根据模式选择发送方式
  askWhenFinish() {
    const { status, notifyTemplates, currentNotifyMode } = this.data;
    let message = notifyTemplates.askWhenFinish
      .replace('{userName}', status.current_user_name);
    
    // 根据通知模式选择发送方式
    if (currentNotifyMode === 'in-app') {
      // 小程序内通知，去掉@符号
      const cleanMessage = message.replace(/@\w+\s*/g, '');
      this.sendInAppNotification(cleanMessage, '询问使用时间');
    } else if (currentNotifyMode === 'share') {
      // 微信分享
      this.shareCurrentStatus(message);
    } else {
      // 传统群消息，根据@模式处理消息
      message = this.processAtMessage(message);
      this.shareToGroup(message, '询问使用时间');
    }
    
    this.hideNotifyModal();
  },

  // 新增：分享当前状态到微信
  shareCurrentStatus(message) {
    // 设置分享数据到全局
    const shareData = {
      title: '洗衣机状态通知',
      message: message,
      timestamp: new Date().toISOString(),
      status: this.data.status
    };
    
    getApp().globalData.shareData = shareData;
    
    // 显示分享引导
    wx.showModal({
      title: '📤 分享到微信',
      content: `${message}\n\n点击"确定"后，请点击右上角"..."按钮，\n选择"发送给朋友"分享到群聊`,
      confirmText: '开始分享',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          // 启用分享菜单
          wx.showShareMenu({
            withShareTicket: true,
            menus: ['shareAppMessage'],
            success: () => {
              wx.showToast({
                title: '请点击右上角"..."分享',
                icon: 'none',
                duration: 3000
              });
            }
          });
        }
      }
    });
  },

  // 新增：快速分享按钮
  quickShare() {
    const { status } = this.data;
    let message = '';
    
    if (status.status === 'idle') {
      message = '🧺 洗衣机现在空闲，可以使用哦～';
    } else if (status.status === 'in_use') {
      const remainingTime = this.getRemainingTime(status.estimated_end_time);
      message = `🧺 洗衣机使用中，${status.current_user_name}在用，预计${remainingTime}后完成`;
    }
    
    this.shareCurrentStatus(message);
  },

  // 根据@模式处理消息内容
  processAtMessage(message) {
    const { atMode, commonMembers } = this.data;
    
    switch (atMode) {
      case 'all':
        // 已经包含@所有人，不需要处理
        return message;
        
      case 'specific':
        if (commonMembers.length > 0) {
          // 替换@所有人为@具体人员
          const atMembers = commonMembers.map(name => `@${name}`).join(' ');
          return message.replace(/@所有人/g, atMembers);
        } else {
          // 没有设置具体人员，提示用户
          wx.showModal({
            title: '提示',
            content: '还没有设置常用@人员，是否现在添加？',
            confirmText: '添加',
            cancelText: '跳过',
            success: (res) => {
              if (res.confirm) {
                this.addCommonMember();
              }
            }
          });
          return message.replace(/@所有人/g, '');
        }
        
      case 'none':
        // 移除所有@
        return message.replace(/@所有人/g, '').replace(/@\w+/g, '');
        
      default:
        return message;
    }
  },

  // 自定义通知 - 改为一键分享
  customNotify() {
    wx.showModal({
      title: '自定义通知内容',
      editable: true,
      placeholderText: '请输入要发送到群的消息...',
      success: (res) => {
        if (res.confirm && res.content.trim()) {
          this.shareToGroup(res.content.trim(), '自定义通知');
        }
      }
    });
    this.hideNotifyModal();
  },

  // 一键分享到群 - 优化为多种分享方式
  shareToGroup(message, title = '洗衣机助手') {
    wx.showActionSheet({
      itemList: ['📤 微信分享', '📋 复制消息', '💬 直接发到群', '🎨 生成分享图片', '📱 生成状态二维码'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            // 微信分享
            this.shareCurrentStatus(message);
            break;
          case 1:
            // 复制消息
            this.copyMessage(message);
            break;
          case 2:
            // 直接发送到群（如果已设置群组）
            this.sendToTargetGroup(message, title);
            break;
          case 3:
            // 生成分享图片
            this.generateShareImage(message, title);
            break;
          case 4:
            // 生成状态二维码
            this.generateStatusQRCode(message, title);
            break;
        }
      }
    });
  },

  // 发送到目标群
  sendToTargetGroup(message, title) {
    if (!this.data.hasGroupSetting) {
      wx.showModal({
        title: '💡 设置群聊',
        content: '还没有设置目标群聊\n\n设置后可以一键发送通知到指定群聊',
        confirmText: '立即设置',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) {
            this.setupTargetGroup();
          }
        }
      });
      return;
    }

    const targetGroup = this.data.targetGroups[0];
    
    wx.showModal({
      title: '📢 确认发送',
      content: `目标群：${targetGroup.name}\n\n消息：${message}\n\n确定发送吗？`,
      confirmText: '立即发送',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.sendDirectNotification(message, title);
        }
      }
    });
  },

  // 生成分享图片
  generateShareImage(message, title) {
    wx.showLoading({ title: '生成图片中...' });
    
    // 模拟生成图片的过程
    setTimeout(() => {
      wx.hideLoading();
      
      wx.showModal({
        title: '🎨 分享图片生成成功',
        content: `已为"${title}"生成精美分享图片\n\n图片包含洗衣机状态信息，方便在群聊中分享`,
        confirmText: '分享图片',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) {
            this.shareGeneratedImage(message, title);
          }
        }
      });
    }, 2000);
  },

  // 分享生成的图片
  shareGeneratedImage(message, title) {
    // 设置分享数据
    getApp().globalData.shareData = {
      title: title,
      path: `/pages/shared/shared?message=${encodeURIComponent(message)}&type=status&timestamp=${Date.now()}`,
      message: message,
      imageUrl: '/images/status-share.png' // 生成的分享图片
    };

    wx.showShareMenu({
      withShareTicket: true,
      success: () => {
        wx.showModal({
          title: '🎨 分享状态图片',
          content: '请点击右上角"..."按钮分享图片\n\n精美的图片让状态分享更直观！',
          confirmText: '开始分享',
          showCancel: false
        });
      }
    });
  },

  // 生成状态二维码
  generateStatusQRCode(message, title) {
    wx.showLoading({ title: '生成状态码中...' });
    
    setTimeout(() => {
      wx.hideLoading();
      
      wx.showModal({
        title: '📱 状态二维码生成成功',
        content: `已生成包含洗衣机状态的小程序码\n\n朋友扫码可直接查看当前状态`,
        confirmText: '分享状态码',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) {
            this.shareStatusQRCode(message, title);
          }
        }
      });
    }, 1500);
  },

  // 分享状态二维码
  shareStatusQRCode(message, title) {
    getApp().globalData.shareData = {
      title: `${title} - 状态二维码`,
      path: `/pages/shared/shared?message=${encodeURIComponent(message)}&type=status&timestamp=${Date.now()}`,
      message: message,
      imageUrl: '/images/status-qr.png' // 状态二维码图片
    };

    wx.showShareMenu({
      withShareTicket: false,
      success: () => {
        wx.showModal({
          title: '📱 分享状态二维码',
          content: '点击右上角"..."分享状态码\n朋友扫码即可查看实时状态！',
          showCancel: false
        });
      }
    });
  },

  // 直接发送通知
  sendDirectNotification(message, title) {
    const { targetGroups, defaultGroupId } = this.data;
    const targetGroup = targetGroups.find(g => g.id === defaultGroupId);
    
    // 显示发送确认
    wx.showModal({
      title: '📢 发送群通知',
      content: `目标群：${targetGroup?.name || '默认群'}\n\n消息内容：${message}\n\n确定发送吗？`,
      confirmText: '立即发送',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          try {
            // 发送到后端处理
            await this.sendNotificationToServer(message, title, targetGroup);
            
            wx.showToast({
              title: '通知发送成功！',
              icon: 'success',
              duration: 2000
            });
            
            // 记录发送统计
            this.recordShareAction(message, title);
            
          } catch (error) {
            console.error('发送通知失败:', error);
            // 降级到复制方案
            wx.showModal({
              title: '发送失败',
              content: '无法直接发送到群，是否复制消息内容？',
              confirmText: '复制消息',
              cancelText: '取消',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  this.copyMessage(message);
                }
              }
            });
          }
        }
      }
    });
  },

  // 发送通知到服务器
  async sendNotificationToServer(message, title, targetGroup) {
    const userInfo = this.data.userInfo;
    
    return await app.request({
      url: '/api/send-group-notification',
      method: 'POST',
      data: {
        message: message,
        title: title,
        groupId: targetGroup?.id,
        groupName: targetGroup?.name,
        userId: app.globalData.userId || userInfo?.nickName,
        userName: userInfo?.nickName || '匿名用户'
      }
    });
  },

  // 设置目标群 - 改进为直接输入群信息
  setupTargetGroup() {
    console.log('setupTargetGroup被调用');
    console.log('当前hasGroupSetting:', this.data.hasGroupSetting);
    console.log('当前targetGroups:', this.data.targetGroups);
    
    // 如果已有群设置，询问是否修改
    if (this.data.hasGroupSetting) {
      wx.showModal({
        title: '修改群设置',
        content: `当前群：${this.data.targetGroups[0]?.name}\n\n是否要修改群设置？`,
        confirmText: '修改',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.showGroupSetup();
          }
        }
      });
    } else {
      // 首次设置，直接进入设置界面
      this.showGroupSetup();
    }
  },

  // 显示群设置界面
  showGroupSetup() {
    console.log('showGroupSetup被调用');
    wx.showModal({
      title: '输入群名称',
      content: '请输入您的洗衣机群聊名称\n（如：宿舍洗衣机群、楼层洗衣群等）',
      editable: true,
      placeholderText: '洗衣机群',
      success: (res) => {
        console.log('群设置输入结果:', res);
        if (res.confirm && res.content.trim()) {
          const groupName = res.content.trim();
          console.log('保存群名称:', groupName);
          
          // 保存群设置
          this.saveGroupSetting({
            id: Date.now().toString(),
            name: groupName,
            setupTime: new Date().toISOString()
          });
          
          wx.showModal({
            title: '✅ 设置成功！',
            content: `群名称：${groupName}\n\n现在您可以使用"📢 直接发送到群"功能了！`,
            confirmText: '试试看',
            showCancel: false,
            success: (modalRes) => {
              if (modalRes.confirm) {
                // 自动打开通知选项
                this.showNotifyOptions();
              }
            }
          });
        }
      }
    });
  },

  // 保存群设置
  saveGroupSetting(groupInfo) {
    const targetGroups = [groupInfo];
    
    wx.setStorageSync('targetGroups', targetGroups);
    wx.setStorageSync('defaultGroupId', groupInfo.id);
    
    this.setData({
      targetGroups,
      defaultGroupId: groupInfo.id,
      hasGroupSetting: true
    });
  },

  // 页面分享配置 - 优化分享内容
  onShareAppMessage(res) {
    const shareData = getApp().globalData.shareData;
    
    if (shareData) {
      // 清除分享数据
      getApp().globalData.shareData = null;
      
      // 构建分享路径，包含状态信息
      const shareUrl = `/pages/shared/shared?message=${encodeURIComponent(shareData.message)}&type=status&timestamp=${shareData.timestamp}`;
      
      return {
        title: shareData.title || '洗衣机状态通知',
        path: shareUrl,
        imageUrl: '', // 可以设置分享图片
        success: (shareRes) => {
          console.log('分享成功', shareRes);
          wx.showToast({
            title: '分享成功！',
            icon: 'success'
          });
          
          // 记录分享统计
          this.recordShareAction(shareData.message, shareData.title);
        },
        fail: (error) => {
          console.error('分享失败', error);
          wx.showToast({
            title: '分享失败',
            icon: 'error'
          });
        }
      };
    }
    
    // 默认分享当前状态
    const { status } = this.data;
    let defaultMessage = '';
    
    if (status.status === 'idle') {
      defaultMessage = '🧺 洗衣机现在空闲，可以使用哦～';
    } else if (status.status === 'in_use') {
      const remainingTime = this.getRemainingTime(status.estimated_end_time);
      defaultMessage = `🧺 洗衣机使用中，${status.current_user_name}在用，预计${remainingTime}后完成`;
    }
    
    return {
      title: '洗衣机状态通知',
      path: `/pages/shared/shared?message=${encodeURIComponent(defaultMessage)}&type=status&timestamp=${Date.now()}`,
      imageUrl: ''
    };
  },

  // 记录分享行为
  recordShareAction(message, title) {
    // 可以记录到后端或本地存储
    const shareRecord = {
      message,
      title,
      timestamp: new Date().toISOString(),
      userId: this.data.userInfo?.nickName || 'anonymous'
    };
    
    // 这里可以发送到后端进行统计
    console.log('分享记录:', shareRecord);
  },

  // 开始使用洗衣机 - 改为一键分享
  async startUsing() {
    const userInfo = this.data.userInfo;
    if (!userInfo) {
      wx.showModal({
        title: '需要用户信息',
        content: '请先获取用户信息才能使用洗衣机',
        confirmText: '获取信息',
        success: (res) => {
          if (res.confirm) {
            this.getUserInfo();
          }
        }
      });
      return;
    }

    // 询问预计使用时间
    wx.showModal({
      title: '开始使用洗衣机',
      content: '请预估使用时间（分钟）',
      editable: true,
      placeholderText: '默认60分钟',
      success: async (res) => {
        if (res.confirm) {
          const estimatedTime = parseInt(res.content) || 60;
          
          wx.showLoading({ title: '提交中...' });
          
          try {
            await app.request({
              url: '/api/start-using',
              method: 'POST',
              data: {
                userId: app.globalData.userId || userInfo.nickName,
                userName: userInfo.nickName,
                estimatedTime: estimatedTime
              }
            });
            
            // 自动生成开始使用的通知
            const message = this.data.notifyTemplates.washingStarted
              .replace('{userName}', userInfo.nickName)
              .replace('{duration}', estimatedTime);
            
            wx.showModal({
              title: '开始使用成功！',
              content: '是否通知群内成员？',
              confirmText: '一键通知',
              cancelText: '稍后',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  this.shareToGroup(message, '洗衣机使用开始');
                }
              }
            });
            
            this.loadStatus();
            
          } catch (error) {
            console.error('开始使用失败', error);
            wx.showToast({
              title: error.message || '操作失败',
              icon: 'error'
            });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 完成使用 - 改为一键分享
  async finishUsing() {
    const userInfo = this.data.userInfo;
    if (!userInfo) {
      return;
    }

    wx.showModal({
      title: '确认',
      content: '确定要标记为使用完成吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '提交中...' });
          
          try {
            await app.request({
              url: '/api/finish-using',
              method: 'POST',
              data: {
                userId: app.globalData.userId || userInfo.nickName
              }
            });
            
            // 自动生成完成使用的通知
            const message = this.data.notifyTemplates.washingFinished
              .replace('{userName}', userInfo.nickName);
            
            wx.showModal({
              title: '使用完成！',
              content: '是否通知群内成员洗衣机已空闲？',
              confirmText: '一键通知',
              cancelText: '稍后',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  this.shareToGroup(message, '洗衣机使用完成');
                }
              }
            });
            
            this.loadStatus();
            
          } catch (error) {
            console.error('完成使用失败', error);
            wx.showToast({
              title: error.message || '操作失败',
              icon: 'error'
            });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 显示等待选项
  showWaitingOptions() {
    const { status } = this.data;
    wx.showActionSheet({
      itemList: ['询问还需多久', '查看详细信息', '设置提醒'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.askWhenFinish();
            break;
          case 1:
            this.showDetailInfo();
            break;
          case 2:
            this.setFinishReminder();
            break;
        }
      }
    });
  },

  // 显示详细信息
  showDetailInfo() {
    const { status } = this.data;
    const startTime = new Date(status.start_time).toLocaleString();
    const endTime = new Date(status.estimated_end_time).toLocaleString();
    const remaining = this.getRemainingTime(status.estimated_end_time);
    
    wx.showModal({
      title: '使用详情',
      content: `使用者：${status.current_user_name}\n开始时间：${startTime}\n预计结束：${endTime}\n剩余时间：${remaining}`,
      showCancel: false
    });
  },

  // 设置完成提醒
  setFinishReminder() {
    wx.showToast({
      title: '功能开发中...',
      icon: 'none'
    });
  },

  // 切换提醒开关
  toggleReminder() {
    const newState = !this.data.reminderEnabled;
    this.setData({ reminderEnabled: newState });
    wx.setStorageSync('reminderEnabled', newState);
    
    wx.showToast({
      title: newState ? '提醒已开启' : '提醒已关闭',
      icon: 'success'
    });
    
    if (newState) {
      // 开启提醒时的逻辑
      this.setupFinishReminder();
    }
  },

  // 设置完成提醒
  setupFinishReminder() {
    // 这里可以设置本地通知或者后端定时任务
    wx.showToast({
      title: '将在洗衣完成时提醒',
      icon: 'none'
    });
  },

  // 显示设置 - 添加群管理
  showSettings() {
    const itemList = [];
    
    // 检查是否有脱敏数据
    const hasDemotedData = this.data.userInfo && this.data.userInfo.isDemoted;
    
    // 根据是否有群组显示不同选项
    if (this.data.currentGroup) {
      itemList.push('👥 群组管理', '📢 群聊设置', '🔧 修改通知模板', '⏰ 提醒设置', '📊 查看群成员', '👤 重新获取用户信息', '🧪 测试getUserProfile');
      if (hasDemotedData) {
        itemList.push('🧹 清除脱敏数据');
      }
      itemList.push('ℹ️ 关于');
    } else {
      itemList.push('➕ 快速创建群组', '👥 加入群组', '🔧 修改通知模板', '⏰ 提醒设置', '👤 重新获取用户信息', '🧪 测试getUserProfile');
      if (hasDemotedData) {
        itemList.push('🧹 清除脱敏数据');
      }
      itemList.push('ℹ️ 关于');
    }
    
    wx.showActionSheet({
      itemList: itemList,
      success: (res) => {
        if (this.data.currentGroup) {
          // 有群组时的选项
          switch (res.tapIndex) {
            case 0:
              this.manageGroup();
              break;
            case 1:
              this.showGroupSettings();
              break;
            case 2:
              this.editNotifyTemplates();
              break;
            case 3:
              this.showReminderSettings();
              break;
            case 4:
              this.showGroupMembers();
              break;
            case 5:
              this.reauthorizeUser();
              break;
            case 6:
              this.testGetUserProfile();
              break;
            case 7:
              if (hasDemotedData) {
                this.clearDemotedData();
              } else {
                this.showAbout();
              }
              break;
            case 8:
              this.showAbout();
              break;
          }
        } else {
          // 没有群组时的选项
          switch (res.tapIndex) {
            case 0:
              this.createGroup();
              break;
            case 1:
              this.joinGroup();
              break;
            case 2:
              this.editNotifyTemplates();
              break;
            case 3:
              this.showReminderSettings();
              break;
            case 4:
              this.reauthorizeUser();
              break;
            case 5:
              this.testGetUserProfile();
              break;
            case 6:
              if (hasDemotedData) {
                this.clearDemotedData();
              } else {
                this.showAbout();
              }
              break;
            case 7:
              this.showAbout();
              break;
          }
        }
      }
    });
  },

  // 群聊设置管理
  showGroupSettings() {
    if (!this.data.hasGroupSetting) {
      this.setupTargetGroup();
      return;
    }
    
    wx.showActionSheet({
      itemList: ['查看当前群设置', '重新设置群', '清除群设置'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.showCurrentGroupInfo();
            break;
          case 1:
            this.setupTargetGroup();
            break;
          case 2:
            this.clearGroupSettings();
            break;
        }
      }
    });
  },

  // 显示当前群信息
  showCurrentGroupInfo() {
    const { targetGroups, defaultGroupId } = this.data;
    const defaultGroup = targetGroups.find(g => g.id === defaultGroupId);
    
    wx.showModal({
      title: '当前群设置',
      content: `默认群：${defaultGroup?.name || '未命名群'}\n设置时间：${defaultGroup?.setupTime ? new Date(defaultGroup.setupTime).toLocaleString() : '未知'}`,
      showCancel: false
    });
  },

  // 清除群设置
  clearGroupSettings() {
    wx.showModal({
      title: '确认清除',
      content: '清除后需要重新设置群聊才能使用一键通知功能',
      confirmText: '确认清除',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('targetGroups');
          wx.removeStorageSync('defaultGroupId');
          
          this.setData({
            targetGroups: [],
            defaultGroupId: '',
            hasGroupSetting: false
          });
          
          wx.showToast({
            title: '群设置已清除',
            icon: 'success'
          });
        }
      }
    });
  },

  // 编辑通知模板
  editNotifyTemplates() {
    wx.showToast({
      title: '功能开发中...',
      icon: 'none'
    });
  },

  // 显示提醒设置
  showReminderSettings() {
    wx.showToast({
      title: '功能开发中...',
      icon: 'none'
    });
  },

  // 显示关于
  showAbout() {
    wx.showModal({
      title: '关于洗衣机助手',
      content: '智能洗衣机状态管理小程序\n支持群通知、定时提醒等功能\n让共用洗衣机管理更简单',
      showCancel: false
    });
  },

  // 跳转到历史页面
  goToHistory() {
    wx.switchTab({
      url: '/pages/history/history'
    });
  },

  // 跳转到预约页面
  goToReserve() {
    wx.switchTab({
      url: '/pages/reserve/reserve'
    });
  },

  // 格式化时间
  formatTime(timeStr) {
    if (!timeStr) return '';
    
    const date = new Date(timeStr);
    const now = new Date();
    const diff = Math.abs(now - date);
    const diffMinutes = Math.floor(diff / (1000 * 60));
    
    if (diffMinutes < 60) {
      return `${diffMinutes}分钟前`;
    } else if (diffMinutes < 24 * 60) {
      const hours = Math.floor(diffMinutes / 60);
      return `${hours}小时前`;
    } else {
      return date.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  },

  // 获取状态文本
  getStatusText(status) {
    switch (status) {
      case 'idle':
        return '✅ 空闲可用';
      case 'in_use':
        return '🔄 使用中';
      case 'maintenance':
        return '🔧 维护中';
      default:
        return '❓ 未知状态';
    }
  },

  // 获取剩余时间
  getRemainingTime(endTimeStr) {
    if (!endTimeStr) return '';
    
    const endTime = new Date(endTimeStr);
    const now = new Date();
    const diff = endTime - now;
    
    if (diff <= 0) {
      return '已超时';
    }
    
    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes < 60) {
      return `${minutes}分钟`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}小时${remainingMinutes}分钟`;
    }
  },

  // 复制消息内容
  copyMessage(message) {
    wx.setClipboardData({
      data: message,
      success: () => {
        wx.showToast({
          title: '消息已复制到剪贴板',
          icon: 'success',
          duration: 2000
        });
        
        // 提示用户去群里粘贴
        setTimeout(() => {
          wx.showModal({
            title: '下一步',
            content: '消息已复制，现在可以去微信群里粘贴发送了',
            confirmText: '知道了',
            showCancel: false
          });
        }, 2000);
      },
      fail: () => {
        wx.showToast({
          title: '复制失败',
          icon: 'error'
        });
      }
    });
  },

  // 设置@模式
  setAtMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ atMode: mode });
    wx.setStorageSync('atMode', mode);
    
    // 显示提示
    const modeText = {
      'all': '@所有人',
      'specific': '@指定人',
      'none': '不@人'
    };
    
    wx.showToast({
      title: `已设置为${modeText[mode]}`,
      icon: 'success',
      duration: 1500
    });
  },

  // 管理常用@人员
  manageMembers() {
    wx.showActionSheet({
      itemList: ['添加常用@人员', '查看当前列表', '清空列表'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.addCommonMember();
            break;
          case 1:
            this.showCommonMembers();
            break;
          case 2:
            this.clearCommonMembers();
            break;
        }
      }
    });
  },

  // 添加常用@人员
  addCommonMember() {
    wx.showModal({
      title: '添加常用@人员',
      content: '请输入要@的人员名称（如：小明、张三等）',
      editable: true,
      placeholderText: '输入姓名或昵称',
      success: (res) => {
        if (res.confirm && res.content.trim()) {
          const newMember = res.content.trim();
          const commonMembers = [...this.data.commonMembers];
          
          if (!commonMembers.includes(newMember)) {
            commonMembers.push(newMember);
            this.setData({ commonMembers });
            wx.setStorageSync('commonMembers', commonMembers);
            
            wx.showToast({
              title: `已添加 ${newMember}`,
              icon: 'success'
            });
          } else {
            wx.showToast({
              title: '该人员已存在',
              icon: 'none'
            });
          }
        }
      }
    });
  },

  // 显示当前常用@人员列表
  showCommonMembers() {
    const { commonMembers } = this.data;
    if (commonMembers.length === 0) {
      wx.showModal({
        title: '常用@人员',
        content: '还没有添加任何常用@人员\n\n点击"添加"来设置常用的@对象',
        showCancel: false
      });
      return;
    }
    
    wx.showActionSheet({
      itemList: [...commonMembers, '删除人员'],
      success: (res) => {
        if (res.tapIndex < commonMembers.length) {
          // 选择了某个人员，可以进行操作
          const selectedMember = commonMembers[res.tapIndex];
          wx.showModal({
            title: '人员操作',
            content: `选中：${selectedMember}\n\n要删除这个人员吗？`,
            confirmText: '删除',
            cancelText: '取消',
            success: (modalRes) => {
              if (modalRes.confirm) {
                this.removeMember(selectedMember);
              }
            }
          });
        } else {
          // 选择了删除功能
          this.showDeleteMemberOptions();
        }
      }
    });
  },

  // 删除指定人员
  removeMember(memberName) {
    const commonMembers = this.data.commonMembers.filter(name => name !== memberName);
    this.setData({ commonMembers });
    wx.setStorageSync('commonMembers', commonMembers);
    
    wx.showToast({
      title: `已删除 ${memberName}`,
      icon: 'success'
    });
  },

  // 清空常用@人员列表
  clearCommonMembers() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空所有常用@人员吗？',
      confirmText: '清空',
      success: (res) => {
        if (res.confirm) {
          this.setData({ commonMembers: [] });
          wx.setStorageSync('commonMembers', []);
          
          wx.showToast({
            title: '已清空列表',
            icon: 'success'
          });
        }
      }
    });
  },

  // 加载在线用户列表
  async loadOnlineUsers() {
    try {
      const data = await app.request({
        url: '/api/online-users'
      });
      this.setData({ onlineUsers: data.users || [] });
    } catch (error) {
      console.error('加载在线用户失败', error);
    }
  },

  // 切换订阅状态
  toggleSubscription() {
    const newState = !this.data.isSubscribed;
    this.setData({ isSubscribed: newState });
    wx.setStorageSync('isSubscribed', newState);
    
    // 向服务器更新订阅状态
    this.updateSubscriptionStatus(newState);
    
    wx.showToast({
      title: newState ? '已开启小程序通知' : '已关闭小程序通知',
      icon: 'success'
    });
  },

  // 更新服务器订阅状态
  async updateSubscriptionStatus(isSubscribed) {
    try {
      await app.request({
        url: '/api/subscription',
        method: 'POST',
        data: {
          userId: app.globalData.userId,
          userName: this.data.userInfo?.nickName,
          isSubscribed: isSubscribed
        }
      });
    } catch (error) {
      console.error('更新订阅状态失败', error);
    }
  },

  // 发送小程序内通知
  async sendInAppNotification(message, type = 'status_update') {
    if (!this.data.isSubscribed) {
      wx.showModal({
        title: '提示',
        content: '您还没有开启小程序通知，是否现在开启？',
        confirmText: '开启',
        success: (res) => {
          if (res.confirm) {
            this.toggleSubscription();
          }
        }
      });
      return;
    }

    // 检查是否有选中的成员
    if (this.data.selectedMembers.length === 0) {
      wx.showModal({
        title: '提示',
        content: '请至少选择一个通知对象',
        showCancel: false
      });
      return;
    }

    try {
      const result = await app.request({
        url: '/api/send-group-notification',
        method: 'POST',
        data: {
          message: message,
          type: type,
          groupId: this.data.currentGroup?.id,
          targetMembers: this.data.selectedMembers,
          userId: app.globalData.userId,
          userName: this.data.userInfo?.nickName
        }
      });

      const notifiedCount = result.notifiedUsers || this.data.selectedMembers.length;
      wx.showToast({
        title: `已通知${notifiedCount}位群成员`,
        icon: 'success'
      });

    } catch (error) {
      console.error('发送通知失败', error);
      wx.showToast({
        title: '通知发送失败',
        icon: 'error'
      });
    }
  },

  // 查看通知历史
  showNotificationHistory() {
    if (this.data.notifications.length === 0) {
      wx.showModal({
        title: '通知历史',
        content: '暂无通知记录',
        showCancel: false
      });
      return;
    }

    // 标记所有通知为已读
    const notifications = this.data.notifications.map(n => ({ ...n, read: true }));
    this.setData({ 
      notifications,
      unreadCount: 0
    });
    wx.setStorageSync('notifications', notifications);

    // 导航到通知历史页面（或者显示模态框）
    const recentNotifications = notifications.slice(0, 5);
    const content = recentNotifications.map(n => 
      `${new Date(n.timestamp).toLocaleString()}\n${n.message}`
    ).join('\n\n');

    wx.showModal({
      title: '最近通知',
      content: content || '暂无通知',
      showCancel: false
    });
  },

  // 加载群组成员
  async loadGroupMembers() {
    // 先检查是否有当前群组
    if (!this.data.currentGroup) {
      console.log('没有当前群组，跳过加载成员');
      return;
    }

    try {
      const data = await app.request({
        url: `/api/group/${this.data.currentGroup.id}/members`
      });
      
      const members = data.members || [];
      const currentUserId = app.globalData.userId;
      
      // 检查是否返回空成员列表，这可能意味着群组不存在或数据丢失
      if (members.length === 0) {
        console.log('群组成员列表为空，可能群组不存在或数据丢失');
        
        // 检查是否是服务器重启导致的数据丢失
        wx.showModal({
          title: '⚠️ 群组数据异常',
          content: `群组"${this.data.currentGroup.name}"暂无成员数据\n\n可能原因：\n• 服务器重启导致数据丢失\n• 群组已被删除\n\n是否重新创建群组？`,
          confirmText: '重新创建',
          cancelText: '稍后处理',
          success: (res) => {
            if (res.confirm) {
              // 清除旧群组数据并重新创建
              this.recreateGroup();
            } else {
              // 使用本地模拟数据
              this.useFallbackMemberData();
            }
          }
        });
        return;
      }
      
      console.log('加载群组成员成功:', members);
      
      this.setData({ 
        groupMembers: members,
        selectedMembers: members.map(m => m.userId), // 默认全选
        isGroupOwner: this.data.currentGroup.ownerId === currentUserId
      });
    } catch (error) {
      console.error('加载群组成员失败', error);
      
      // 如果是404错误，说明群组不存在
      if (error.message && error.message.includes('404')) {
        wx.showModal({
          title: '❌ 群组不存在',
          content: `群组"${this.data.currentGroup.name}"不存在\n\n可能已被删除或服务器数据重置\n\n是否重新创建群组？`,
          confirmText: '重新创建',
          cancelText: '稍后',
          success: (res) => {
            if (res.confirm) {
              this.recreateGroup();
            }
          }
        });
        return;
      }
      
      // 其他网络错误，使用本地模拟数据
      this.useFallbackMemberData();
    }
  },

  // 重新创建群组
  recreateGroup() {
    // 安全获取旧群组名称，避免null错误
    const oldGroupName = this.data.currentGroup?.name || '洗衣机群';
    
    // 先检查用户信息
    if (!this.data.userInfo || this.data.userInfo.isAnonymous) {
      wx.showModal({
        title: '💡 需要微信授权',
        content: '重新创建群组需要使用您的微信昵称\n\n这样其他成员可以看到是谁创建的群组\n\n是否授权获取微信信息？',
        confirmText: '立即授权',
        cancelText: '稍后',
        success: async (res) => {
          if (res.confirm) {
            try {
              await this.getUserInfo();
              // 授权成功后再次调用重新创建群组
              this.recreateGroup();
            } catch (error) {
              wx.showToast({
                title: '授权失败',
                icon: 'error'
              });
            }
          }
        }
      });
      return;
    }
    
    // 清除旧群组数据
    this.setData({
      currentGroup: null,
      groupMembers: [],
      selectedMembers: [],
      isGroupOwner: false
    });
    wx.removeStorageSync('currentGroup');
    
    // 提示用户输入新群组名称
    wx.showModal({
      title: '🏠 重新创建群组',
      content: '请为新群组输入名称',
      editable: true,
      placeholderText: oldGroupName,
      success: async (res) => {
        if (res.confirm && res.content.trim()) {
          const groupName = res.content.trim();
          
          wx.showLoading({ title: '创建中...' });
          
          try {
            // 确保使用真实的用户信息
            const userInfo = this.data.userInfo;
            const realUserName = userInfo.nickName && !userInfo.isAnonymous ? userInfo.nickName : '群主';
            
            console.log('重新创建群组，使用用户信息:', {
              userId: app.globalData.userId,
              userName: realUserName,
              isAnonymous: userInfo.isAnonymous
            });
            
            const result = await app.request({
              url: '/api/group/create',
              method: 'POST',
              data: {
                name: groupName,
                ownerId: app.globalData.userId,
                ownerName: realUserName  // 使用真实昵称
              }
            });
            
            const newGroup = result.group;
            this.setData({ currentGroup: newGroup });
            wx.setStorageSync('currentGroup', newGroup);
            
            // 重新加载群组成员
            this.loadGroupMembers();
            
            wx.hideLoading();
            
            wx.showModal({
              title: '✅ 群组重建成功！',
              content: `新群组：${groupName}\n群主：${realUserName}\n群号：${newGroup.id}\n\n现在可以重新邀请成员加入了！`,
              confirmText: '邀请成员',
              cancelText: '稍后',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  this.showInviteOptions();
                }
              }
            });
            
          } catch (error) {
            wx.hideLoading();
            console.error('重新创建群组失败', error);
            wx.showToast({
              title: error.message || '创建失败',
              icon: 'error'
            });
          }
        }
      }
    });
  },

  // 使用备用成员数据
  useFallbackMemberData() {
    // 安全检查currentGroup是否存在
    if (!this.data.currentGroup) {
      console.log('当前群组为空，无法使用备用成员数据');
      wx.showModal({
        title: '⚠️ 群组数据缺失',
        content: '当前没有群组信息\n\n是否重新创建群组？',
        confirmText: '创建群组',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) {
            this.createGroup();
          }
        }
      });
      return;
    }
    
    // 网络失败时使用本地模拟数据
    const mockMembers = [
      {
        userId: this.data.currentGroup.ownerId || 'unknown_owner',
        userName: this.data.currentGroup.ownerName || '群主',
        role: 'owner',
        joined_at: new Date().toISOString()
      }
    ];
    
    // 如果当前用户不是群主，添加当前用户
    if (this.data.currentGroup.ownerId !== app.globalData.userId) {
      mockMembers.push({
        userId: app.globalData.userId || 'unknown_user',
        userName: this.data.userInfo?.nickName || '我',
        role: 'member',
        joined_at: new Date().toISOString()
      });
    }
    
    console.log('使用模拟群成员数据:', mockMembers);
    
    this.setData({ 
      groupMembers: mockMembers,
      selectedMembers: mockMembers.map(m => m.userId),
      isGroupOwner: (this.data.currentGroup.ownerId === app.globalData.userId)
    });
    
    // 提示用户数据异常
    wx.showToast({
      title: '⚠️ 使用离线数据',
      icon: 'none',
      duration: 2000
    });
  },

  // 网络诊断功能
  async runNetworkDiagnostic() {
    wx.showLoading({ title: '诊断中...' });
    
    const diagnosticResults = [];
    
    try {
      // 1. 检查系统信息
      console.log('=== 开始网络诊断 ===');
      const systemInfo = wx.getSystemInfoSync();
      console.log('系统信息:', systemInfo);
      diagnosticResults.push({
        test: '系统环境检测',
        status: 'success',
        message: `平台: ${systemInfo.platform}, 版本: ${systemInfo.version}`
      });
      
      // 2. 检查服务器地址配置
      const serverUrl = app.globalData.serverUrl;
      console.log('服务器地址:', serverUrl);
      diagnosticResults.push({
        test: '服务器地址配置',
        status: 'success',
        message: `当前地址: ${serverUrl}`
      });
      
      // 3. 测试基础网络连通性
      console.log('开始测试网络连通性...');
      try {
        const result = await this.testRawRequest('/health');
        console.log('健康检查结果:', result);
        diagnosticResults.push({
          test: '网络连接测试',
          status: 'success',
          message: `连接成功！服务器状态: ${result.data.status}`
        });
        
        // 更新网络状态
        this.setData({ networkStatus: 'online' });
      } catch (error) {
        console.error('网络连接测试失败:', error);
        diagnosticResults.push({
          test: '网络连接测试',
          status: 'failed',
          message: `连接失败: ${error.message}`
        });
        
        // 更新网络状态
        this.setData({ networkStatus: 'offline' });
        
        // 4. 如果连接失败，测试网络权限
        diagnosticResults.push({
          test: '可能的解决方案',
          status: 'info',
          message: '1. 检查微信开发者工具域名校验设置\n2. 确保服务器正在运行\n3. 检查网络连接'
        });
      }
      
      // 5. WebSocket连接测试
      diagnosticResults.push({
        test: 'WebSocket配置',
        status: 'info',
        message: `WebSocket地址: ${app.getWebSocketUrl ? app.getWebSocketUrl() : 'WebSocket未配置'}`
      });
      
      wx.hideLoading();
      this.showDiagnosticResults(diagnosticResults);
      
    } catch (error) {
      wx.hideLoading();
      console.error('诊断过程出错:', error);
      wx.showModal({
        title: '诊断失败',
        content: `诊断过程出错: ${error.message}`,
        showCancel: false
      });
    }
  },

  // 测试网络连接
  async testNetworkConnection() {
    console.log('=== 测试网络连接 ===');
    
    this.setData({ networkStatus: 'connecting' });
    
    try {
      // 测试健康检查接口
      const result = await this.testRawRequest('/health');
      console.log('网络连接测试成功:', result);
      
      this.setData({ networkStatus: 'online' });
      
      wx.showToast({
        title: '网络连接正常',
        icon: 'success',
        duration: 2000
      });
      
      // 连接成功后重新加载状态
      this.loadStatus();
      
    } catch (error) {
      console.error('网络连接测试失败:', error);
      
      this.setData({ networkStatus: 'offline' });
      
      wx.showModal({
        title: '🌐 网络连接失败',
        content: `连接服务器失败：${error.message}\n\n请检查：\n• 服务器是否正在运行\n• 开发者工具域名校验设置\n• 网络连接是否正常`,
        confirmText: '重试',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) {
            // 延迟重试
            setTimeout(() => {
              this.testNetworkConnection();
            }, 1000);
          }
        }
      });
    }
  },

  // 原始网络请求测试（绕过app.request的封装）
  testRawRequest(url) {
    return new Promise((resolve, reject) => {
      const fullUrl = app.globalData.serverUrl + url;
      console.log('原始请求测试:', fullUrl);
      
      wx.request({
        url: fullUrl,
        method: 'GET',
        success: (res) => {
          console.log('原始请求成功:', res);
          if (res.statusCode === 200) {
            resolve(res.data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${res.data || '未知错误'}`));
          }
        },
        fail: (error) => {
          console.error('原始请求失败:', error);
          reject(new Error(`请求失败: ${error.errMsg}`));
        }
      });
    });
  },

  // 显示诊断结果
  showDiagnosticResults(results) {
    const resultText = results.map(result => {
      const statusIcon = result.status === 'success' ? '✅' : 
                        result.status === 'failed' ? '❌' : 'ℹ️';
      return `${statusIcon} ${result.test}\n${result.message}`;
    }).join('\n\n');
    
    wx.showModal({
      title: '🔍 网络诊断结果',
      content: resultText,
      confirmText: '知道了',
      showCancel: false
    });
  },

  // 处理群组邀请
  handleGroupInvite(options) {
    const { groupId, inviter, source } = options;
    const inviterName = inviter ? decodeURIComponent(inviter) : '朋友';
    const sourceText = source === 'qrcode' ? '扫码' : '点击邀请';
    
    // 延迟显示邀请对话框，确保页面完全加载
    setTimeout(() => {
      wx.showModal({
        title: '🎉 收到群组邀请',
        content: `${inviterName} 邀请您加入洗衣机群组\n\n群号：${groupId}\n来源：${sourceText}\n\n是否立即加入？`,
        confirmText: '立即加入',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) {
            this.autoJoinGroup(groupId, inviterName);
          } else {
            // 用户选择稍后加入，保存邀请信息
            wx.setStorageSync('pendingInvite', {
              groupId,
              inviter: inviterName,
              timestamp: Date.now()
            });
            
            wx.showToast({
              title: '邀请已保存，可稍后加入',
              icon: 'none',
              duration: 2000
            });
          }
        }
      });
    }, 1500);
  },

  // 自动加入群组
  async autoJoinGroup(groupId, inviterName) {
    const userInfo = this.data.userInfo;
    if (!userInfo) {
      await this.getUserInfo();
    }

    wx.showLoading({ title: '加入中...' });
    
    try {
      const result = await app.request({
        url: '/api/group/join',
        method: 'POST',
        data: {
          groupCode: groupId,
          userId: app.globalData.userId,
          userName: this.data.userInfo?.nickName
        }
      });
      
      const group = result.group;
      this.setData({ currentGroup: group });
      wx.setStorageSync('currentGroup', group);
      
      // 加载群组成员
      this.loadGroupMembers();
      
      // 清除待处理的邀请
      wx.removeStorageSync('pendingInvite');
      
      wx.hideLoading();
      
      wx.showModal({
        title: '🎉 加入成功！',
        content: `欢迎加入"${group.name}"！\n\n现在您可以：\n• 查看洗衣机实时状态\n• 接收群组通知\n• 邀请更多朋友加入`,
        confirmText: '开始使用',
        showCancel: false
      });
      
    } catch (error) {
      wx.hideLoading();
      console.error('自动加入群组失败', error);
      
      wx.showModal({
        title: '❌ 加入失败',
        content: `无法加入群组：${error.message || '网络错误'}\n\n您可以稍后手动输入群号加入`,
        confirmText: '手动加入',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) {
            this.joinGroup();
          }
        }
      });
    }
  },

  // 创建群组
  createGroup() {
    // 先检查用户信息
    if (!this.data.userInfo || this.data.userInfo.isAnonymous) {
      wx.showModal({
        title: '💡 需要微信授权',
        content: '创建群组需要使用您的微信昵称\n\n这样其他成员可以看到是谁创建的群组\n\n是否授权获取微信信息？',
        confirmText: '立即授权',
        cancelText: '稍后',
        success: async (res) => {
          if (res.confirm) {
            try {
              await this.getUserInfo();
              // 授权成功后再次调用创建群组
              this.createGroup();
            } catch (error) {
              wx.showToast({
                title: '授权失败',
                icon: 'error'
              });
            }
          }
        }
      });
      return;
    }
    
    wx.showModal({
      title: '创建洗衣机群组',
      content: '请输入群组名称（如：502宿舍洗衣机群）',
      editable: true,
      placeholderText: '502宿舍洗衣机群',
      success: async (res) => {
        if (res.confirm && res.content.trim()) {
          const groupName = res.content.trim();
          
          wx.showLoading({ title: '创建中...' });
          
          try {
            // 确保使用真实的用户信息
            const userInfo = this.data.userInfo;
            const realUserName = userInfo.nickName && !userInfo.isAnonymous ? userInfo.nickName : '群主';
            
            console.log('创建群组，使用用户信息:', {
              userId: app.globalData.userId,
              userName: realUserName,
              isAnonymous: userInfo.isAnonymous
            });
            
            const result = await app.request({
              url: '/api/group/create',
              method: 'POST',
              data: {
                name: groupName,
                ownerId: app.globalData.userId,
                ownerName: realUserName  // 使用真实昵称
              }
            });
            
            const newGroup = result.group;
            this.setData({ currentGroup: newGroup });
            wx.setStorageSync('currentGroup', newGroup);
            
            // 加载群组成员（目前只有创建者）
            this.loadGroupMembers();
            
            wx.showModal({
              title: '群组创建成功！',
              content: `群组：${groupName}\n群主：${realUserName}\n群号：${newGroup.id}\n\n现在可以邀请室友加入了！`,
              confirmText: '邀请成员',
              cancelText: '稍后',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  this.showInviteOptions();
                }
              }
            });
            
          } catch (error) {
            console.error('创建群组失败', error);
            wx.showToast({
              title: error.message || '创建失败',
              icon: 'error'
            });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 加入群组
  joinGroup() {
    // 先检查用户信息
    if (!this.data.userInfo || this.data.userInfo.isAnonymous) {
      wx.showModal({
        title: '💡 需要微信授权',
        content: '加入群组需要使用您的微信昵称\n\n这样其他成员可以看到是谁加入了群组\n\n是否授权获取微信信息？',
        confirmText: '立即授权',
        cancelText: '稍后',
        success: async (res) => {
          if (res.confirm) {
            try {
              await this.getUserInfo();
              // 授权成功后再次调用加入群组
              this.joinGroup();
            } catch (error) {
              wx.showToast({
                title: '授权失败',
                icon: 'error'
              });
            }
          }
        }
      });
      return;
    }
    
    wx.showModal({
      title: '加入洗衣机群组',
      content: '请输入群组邀请码或群号',
      editable: true,
      placeholderText: '输入群号或邀请码',
      success: async (res) => {
        if (res.confirm && res.content.trim()) {
          const groupCode = res.content.trim();
          
          wx.showLoading({ title: '加入中...' });
          
          try {
            // 确保使用真实的用户信息
            const userInfo = this.data.userInfo;
            const realUserName = userInfo.nickName && !userInfo.isAnonymous ? userInfo.nickName : '用户';
            
            console.log('加入群组，使用用户信息:', {
              userId: app.globalData.userId,
              userName: realUserName,
              isAnonymous: userInfo.isAnonymous
            });
            
            const result = await app.request({
              url: '/api/group/join',
              method: 'POST',
              data: {
                groupCode: groupCode,
                userId: app.globalData.userId,
                userName: realUserName  // 使用真实昵称
              }
            });
            
            const group = result.group;
            this.setData({ currentGroup: group });
            wx.setStorageSync('currentGroup', group);
            
            // 加载群组成员
            this.loadGroupMembers();
            
            wx.showToast({
              title: `已加入 ${group.name}`,
              icon: 'success'
            });
            
          } catch (error) {
            console.error('加入群组失败', error);
            wx.showToast({
              title: error.message || '加入失败',
              icon: 'error'
            });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  // 显示邀请选项
  showInviteOptions() {
    wx.showActionSheet({
      itemList: ['🔗 生成邀请链接', '📱 小程序分享', '📋 复制群组信息', '🎨 生成邀请海报'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.generateInviteLink();
            break;
          case 1:
            this.shareInvite();
            break;
          case 2:
            this.copyGroupInfo(this.data.currentGroup);
            break;
          case 3:
            this.generateInvitePoster(this.data.currentGroup);
            break;
        }
      }
    });
  },

  // 生成邀请链接
  generateInviteLink() {
    const group = this.data.currentGroup;
    
    if (!group) {
      wx.showToast({
        title: '请先创建或加入群组',
        icon: 'none'
      });
      return;
    }

    // 构建Web邀请链接
    const inviterName = this.data.userInfo?.nickName || '朋友';
    const baseUrl = 'http://10.93.199.165:3000'; // 使用您的服务器地址
    const inviteUrl = `${baseUrl}/invite.html?groupId=${group.id}&groupName=${encodeURIComponent(group.name)}&inviter=${encodeURIComponent(inviterName)}`;

    wx.showActionSheet({
      itemList: ['📋 复制邀请链接', '📤 分享链接到微信', '👀 预览邀请页面'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.copyInviteLink(inviteUrl, group);
            break;
          case 1:
            this.shareInviteLink(inviteUrl, group, inviterName);
            break;
          case 2:
            this.previewInvitePage(inviteUrl);
            break;
        }
      }
    });
  },

  // 复制邀请链接
  copyInviteLink(inviteUrl, group) {
    const message = `🏠 ${this.data.userInfo?.nickName || '朋友'} 邀请您加入洗衣机群组\n\n群组：${group.name}\n\n🔗 点击链接查看详情：\n${inviteUrl}\n\n或复制群号：${group.id}\n在小程序中手动加入`;

    wx.setClipboardData({
      data: message,
      success: () => {
        wx.showModal({
          title: '🎉 邀请链接已复制！',
          content: '邀请信息已复制到剪贴板\n\n朋友点击链接即可看到邀请详情，无需安装小程序！',
          confirmText: '知道了',
          showCancel: false
        });
      }
    });
  },

  // 分享邀请链接
  shareInviteLink(inviteUrl, group, inviterName) {
    // 设置分享数据为链接类型
    getApp().globalData.shareData = {
      title: `${inviterName} 邀请您加入 ${group.name}`,
      path: `/pages/shared/shared?type=invite&url=${encodeURIComponent(inviteUrl)}&groupName=${encodeURIComponent(group.name)}`,
      message: `🏠 点击查看邀请详情`,
      type: 'web_invite'
    };

    this.triggerShare();
  },

  // 预览邀请页面
  previewInvitePage(inviteUrl) {
    wx.showModal({
      title: '📖 预览邀请页面',
      content: `邀请页面链接：\n${inviteUrl}\n\n朋友打开此链接就能看到精美的邀请页面，无需安装小程序即可了解群组信息！`,
      confirmText: '打开预览',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          // 在小程序中打开Web页面
          wx.navigateTo({
            url: `/pages/webview/webview?url=${encodeURIComponent(inviteUrl)}`
          }).catch(() => {
            // 如果没有webview页面，显示链接
            wx.showModal({
              title: '📱 在浏览器中打开',
              content: `请复制以下链接在浏览器中查看：\n\n${inviteUrl}`,
              confirmText: '复制链接',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  wx.setClipboardData({
                    data: inviteUrl,
                    success: () => {
                      wx.showToast({
                        title: '链接已复制',
                        icon: 'success'
                      });
                    }
                  });
                }
              }
            });
          });
        }
      }
    });
  },

  // 分享邀请
  shareInvite() {
    const group = this.data.currentGroup;
    
    if (!group) {
      wx.showToast({
        title: '请先创建或加入群组',
        icon: 'none'
      });
      return;
    }
    
    // 设置分享数据
    getApp().globalData.shareData = {
      title: `邀请您加入 ${group.name}`,
      path: `/pages/index/index?groupId=${group.id}&action=join&inviter=${encodeURIComponent(this.data.userInfo?.nickName || '朋友')}`,
      message: `${this.data.userInfo?.nickName || '朋友'} 邀请您加入洗衣机群组：${group.name}`,
      type: 'invite'
    };

    // 直接触发分享
    this.triggerShare();
  },

  // 触发分享
  triggerShare() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline'],
      success: () => {
        wx.showModal({
          title: '📤 开始分享',
          content: '请点击右上角"..."按钮\n选择"发送给朋友"分享邀请\n\n朋友点击后可直接加入群组！',
          confirmText: '我知道了',
          showCancel: false,
          success: () => {
            // 3秒后自动提示分享按钮位置
            setTimeout(() => {
              wx.showToast({
                title: '点击右上角"..."分享',
                icon: 'none',
                duration: 3000
              });
            }, 1000);
          }
        });
      },
      fail: (error) => {
        console.error('显示分享菜单失败:', error);
        // 降级到复制方案
        this.showAlternativeShare();
      }
    });
  },

  // 备用分享方案
  showAlternativeShare() {
    const group = this.data.currentGroup;
    const inviteMessage = `🏠 ${this.data.userInfo?.nickName || '朋友'} 邀请您加入洗衣机群组\n\n群组：${group.name}\n群号：${group.id}\n\n请在小程序中点击"加入群组"并输入群号！`;
    
    wx.showModal({
      title: '📋 分享邀请',
      content: '原生分享不可用，为您准备了邀请消息\n\n点击"复制消息"即可分享给朋友',
      confirmText: '复制消息',
      cancelText: '稍后',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: inviteMessage,
            success: () => {
              wx.showToast({
                title: '邀请消息已复制',
                icon: 'success'
              });
            }
          });
        }
      }
    });
  },

  // 复制群组信息
  copyGroupInfo(group) {
    const groupInfo = `🏠 洗衣机群组邀请\n\n群组：${group.name}\n群号：${group.id}\n创建时间：${new Date(group.created_at || Date.now()).toLocaleDateString()}\n\n📱 使用方法：\n1. 搜索"洗衣机助手"小程序\n2. 点击"加入群组"\n3. 输入群号：${group.id}\n\n一起管理洗衣机，避免白跑一趟！`;
    
    wx.setClipboardData({
      data: groupInfo,
      success: () => {
        wx.showModal({
          title: '📋 群组信息已复制',
          content: '群组信息已复制到剪贴板\n\n现在可以发送给朋友，让他们按照提示加入群组！',
          confirmText: '知道了',
          showCancel: false
        });
      }
    });
  },

  // 生成邀请海报
  generateInvitePoster(group) {
    wx.showLoading({ title: '生成海报中...' });
    
    setTimeout(() => {
      wx.hideLoading();
      
      wx.showModal({
        title: '🎨 邀请海报',
        content: `已为"${group.name}"生成精美邀请海报\n\n海报包含群组信息和加入方式，方便朋友了解和加入`,
        confirmText: '分享海报',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) {
            // 这里可以实现海报分享逻辑
            this.shareInvitePoster(group);
          }
        }
      });
    }, 2000);
  },

  // 分享邀请海报
  shareInvitePoster(group) {
    getApp().globalData.shareData = {
      title: `${group.name} - 邀请海报`,
      path: `/pages/index/index?groupId=${group.id}&action=join`,
      message: `${group.name} 邀请您一起管理洗衣机`,
      imageUrl: '/images/invite-poster.png' // 邀请海报图片
    };

    wx.showShareMenu({
      withShareTicket: false,
      success: () => {
        wx.showModal({
          title: '🎨 分享邀请海报',
          content: '点击右上角"..."分享海报图片\n精美海报让邀请更有吸引力！',
          showCancel: false
        });
      }
    });
  },

  // 管理群组
  manageGroup() {
    if (!this.data.currentGroup) {
      wx.showActionSheet({
        itemList: ['创建群组', '加入群组'],
        success: (res) => {
          if (res.tapIndex === 0) {
            this.createGroup();
          } else {
            this.joinGroup();
          }
        }
      });
      return;
    }

    const itemList = this.data.isGroupOwner 
      ? ['查看群成员', '邀请新成员', '群组设置', '退出群组']
      : ['查看群成员', '邀请新成员', '退出群组'];

    wx.showActionSheet({
      itemList: itemList,
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.showGroupMembers();
            break;
          case 1:
            this.showInviteOptions();
            break;
          case 2:
            if (this.data.isGroupOwner) {
              this.showGroupSettings();
            } else {
              this.leaveGroup();
            }
            break;
          case 3:
            this.leaveGroup();
            break;
        }
      }
    });
  },

  // 显示群成员
  showGroupMembers() {
    const members = this.data.groupMembers;
    if (members.length === 0) {
      wx.showModal({
        title: '群成员',
        content: '暂无群成员',
        showCancel: false
      });
      return;
    }

    const memberList = members.map(m => 
      `${m.userName}${m.userId === this.data.currentGroup.ownerId ? ' (群主)' : ''}`
    ).join('\n');

    wx.showModal({
      title: `群成员 (${members.length}人)`,
      content: memberList,
      showCancel: false
    });
  },

  // 退出群组
  leaveGroup() {
    wx.showModal({
      title: '确认退出',
      content: `确定要退出群组 "${this.data.currentGroup.name}" 吗？`,
      confirmText: '退出',
      success: async (res) => {
        if (res.confirm) {
          try {
            await app.request({
              url: '/api/group/leave',
              method: 'POST',
              data: {
                groupId: this.data.currentGroup.id,
                userId: app.globalData.userId
              }
            });

            this.setData({
              currentGroup: null,
              groupMembers: [],
              selectedMembers: [],
              isGroupOwner: false
            });
            wx.removeStorageSync('currentGroup');

            wx.showToast({
              title: '已退出群组',
              icon: 'success'
            });

          } catch (error) {
            console.error('退出群组失败', error);
            wx.showToast({
              title: '退出失败',
              icon: 'error'
            });
          }
        }
      }
    });
  },

  // 切换成员选择
  toggleMemberSelection(e) {
    const userId = e.currentTarget.dataset.userId;
    const selectedMembers = [...this.data.selectedMembers];
    
    const index = selectedMembers.indexOf(userId);
    if (index > -1) {
      selectedMembers.splice(index, 1);
    } else {
      selectedMembers.push(userId);
    }
    
    this.setData({ selectedMembers });
  },

  // 全选成员
  selectAllMembers() {
    const allMemberIds = this.data.groupMembers.map(m => m.userId);
    this.setData({ selectedMembers: allMemberIds });
  },

  // 全不选成员
  selectNoneMembers() {
    this.setData({ selectedMembers: [] });
  },

  // 重新授权用户信息
  reauthorizeUser() {
    const currentUser = this.data.userInfo;
    const currentName = currentUser ? currentUser.nickName : '未知';
    const isAnonymous = currentUser ? currentUser.isAnonymous : true;
    
    wx.showModal({
      title: '🔄 重新获取用户信息',
      content: `当前用户：${currentName}\n状态：${isAnonymous ? '匿名用户' : '已授权'}\n\n重新获取可以更新为真实的微信昵称`,
      confirmText: '重新授权',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          try {
            await this.getUserInfo();
            
            // 如果获取成功且有当前群组，提示是否更新群组信息
            if (this.data.currentGroup && this.data.userInfo && !this.data.userInfo.isAnonymous) {
              wx.showModal({
                title: '✅ 用户信息更新成功',
                content: `新昵称：${this.data.userInfo.nickName}\n\n是否重新创建群组以使用新昵称？`,
                confirmText: '重新创建',
                cancelText: '稍后',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    this.recreateGroup();
                  }
                }
              });
            }
          } catch (error) {
            console.error('重新授权失败:', error);
          }
        }
      }
    });
  },

  // 测试getUserProfile接口
  async testGetUserProfile() {
    console.log('=== 测试getUserProfile接口 ===');
    
    try {
      // 检查接口可用性
      if (!wx.getUserProfile) {
        throw new Error('getUserProfile接口不可用');
      }
      
      console.log('getUserProfile接口可用，开始测试...');
      
      const result = await new Promise((resolve, reject) => {
        wx.getUserProfile({
          desc: '测试获取用户信息',
          success: (res) => {
            console.log('测试成功，获取到用户信息:', res);
            resolve(res);
          },
          fail: (error) => {
            console.error('测试失败:', error);
            reject(error);
          }
        });
      });
      
      const userInfo = result.userInfo;
      const isDemoted = userInfo.is_demote === true || userInfo.nickName === '微信用户';
      
      wx.showModal({
        title: '🧪 测试结果',
        content: `getUserProfile测试${isDemoted ? '返回脱敏数据' : '成功'}！\n\n昵称：${userInfo.nickName}\n头像：${userInfo.avatarUrl ? '有' : '无'}\n性别：${userInfo.gender}\n地区：${userInfo.country} ${userInfo.province} ${userInfo.city}\n脱敏：${isDemoted ? '是' : '否'}`,
        confirmText: isDemoted ? '清除脱敏数据' : '保存用户信息',
        cancelText: '仅测试',
        success: (res) => {
          if (res.confirm) {
            if (isDemoted) {
              // 清除脱敏数据
              this.clearDemotedData();
            } else {
              // 用户选择保存真实数据
              const realUserInfo = {
                ...userInfo,
                isAnonymous: false
              };
              
              app.globalData.userInfo = realUserInfo;
              app.globalData.userId = realUserInfo.nickName;
              wx.setStorageSync('userInfo', realUserInfo);
              
              this.setData({
                userInfo: realUserInfo,
                hasUserInfo: true
              });
              
              wx.showToast({
                title: '真实用户信息已保存',
                icon: 'success'
              });
            }
          }
        }
      });
      
    } catch (error) {
      console.error('getUserProfile测试失败:', error);
      
      let errorMsg = '测试失败';
      if (error.errMsg) {
        if (error.errMsg.includes('cancel')) {
          errorMsg = '用户取消了授权';
        } else if (error.errMsg.includes('fail')) {
          errorMsg = `接口调用失败：${error.errMsg}`;
        }
      } else {
        errorMsg = error.message || '未知错误';
      }
      
      wx.showModal({
        title: '🧪 测试结果',
        content: `getUserProfile测试失败\n\n错误：${errorMsg}\n\n这表明在当前环境下无法获取真实的微信用户信息`,
        confirmText: '知道了',
        showCancel: false
      });
    }
  },

  // 清除脱敏数据
  clearDemotedData() {
    wx.showModal({
      title: '🧹 清除脱敏数据',
      content: '将清除当前的脱敏用户数据\n\n清除后系统将使用临时用户身份\n\n建议在真机环境中重新获取用户信息',
      confirmText: '立即清除',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          // 清除缓存
          app.clearUserCache();
          
          // 创建新的临时用户
          app.createTemporaryAnonymousUser();
          
          // 更新页面数据
          this.setData({
            userInfo: app.globalData.userInfo,
            hasUserInfo: true
          });
          
          wx.showToast({
            title: '脱敏数据已清除',
            icon: 'success',
            duration: 2000
          });
          
          // 提示用户在真机环境重新授权
          setTimeout(() => {
            wx.showModal({
              title: '💡 建议',
              content: '已清除脱敏数据\n\n为获取真实用户信息，建议：\n• 在真机环境中使用\n• 发布为体验版测试\n• 确保微信版本7.0.9+',
              confirmText: '知道了',
              showCancel: false
            });
          }, 2500);
        }
      }
    });
  },
}); 