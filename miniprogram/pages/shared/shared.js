const app = getApp();

Page({
  data: {
    message: '',
    type: 'notify',
    timestamp: new Date().toISOString(),
    showStatus: false,
    status: {},
    shareTitle: '洗衣机状态通知',
    showWebInvite: false,
    inviteUrl: ''
  },

  onLoad(options) {
    const { message, type, timestamp, url, groupName } = options;
    
    if (message) {
      this.setData({
        message: decodeURIComponent(message),
        type: type || 'notify',
        timestamp: timestamp || new Date().toISOString(),
        shareTitle: this.getShareTitle(type)
      });
    }
    
    // 处理Web邀请链接
    if (type === 'invite' && url) {
      this.handleWebInvite(decodeURIComponent(url), decodeURIComponent(groupName || ''));
    }
    
    // 如果是状态通知，加载当前状态
    if (type === 'notify' || type === 'status') {
      this.loadCurrentStatus();
    }
    
    // 设置分享菜单
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage']
    });
  },

  onShow() {
    // 每次显示时刷新状态
    if (this.data.type === 'notify' || this.data.type === 'status') {
      this.loadCurrentStatus();
    }
  },

  // 获取分享标题
  getShareTitle(type) {
    switch (type) {
      case 'status':
        return '洗衣机状态通知';
      case 'notify':
        return '洗衣机群通知';
      case 'invite':
        return '邀请加入洗衣机群组';
      default:
        return '洗衣机助手';
    }
  },

  // 加载当前状态
  async loadCurrentStatus() {
    try {
      const data = await app.request({
        url: '/api/status'
      });
      
      this.setData({
        status: data,
        showStatus: true
      });
      
    } catch (error) {
      console.error('加载状态失败:', error);
      // 离线模式，使用模拟数据
      this.setData({
        status: {
          status: 'idle',
          current_user_name: null,
          start_time: null,
          estimated_end_time: null,
          updated_at: new Date().toISOString()
        },
        showStatus: true
      });
    }
  },

  // 继续分享
  continueShare() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage'],
      success: () => {
        wx.showModal({
          title: '📤 继续分享',
          content: '点击右上角"..."按钮，选择"发送给朋友"即可分享到群聊',
          confirmText: '知道了',
          showCancel: false
        });
      }
    });
  },

  // 复制消息
  copyMessage() {
    wx.setClipboardData({
      data: this.data.message,
      success: () => {
        wx.showToast({
          title: '消息已复制',
          icon: 'success'
        });
      }
    });
  },

  // 打开小程序主页
  openApp() {
    wx.navigateTo({
      url: '/pages/index/index'
    });
  },

  // 刷新状态
  refreshStatus() {
    wx.showLoading({ title: '刷新中...' });
    this.loadCurrentStatus().finally(() => {
      wx.hideLoading();
      wx.showToast({
        title: '状态已刷新',
        icon: 'success'
      });
    });
  },

  // 查看状态
  checkStatus() {
    wx.navigateTo({
      url: '/pages/index/index'
    });
  },

  // 快速预约
  quickReserve() {
    wx.navigateTo({
      url: '/pages/reserve/reserve'
    });
  },

  // 查看历史
  viewHistory() {
    wx.navigateTo({
      url: '/pages/history/history'
    });
  },

  // 格式化时间
  formatTime(timeStr) {
    if (!timeStr) return '';
    
    const date = new Date(timeStr);
    const now = new Date();
    const diff = Math.abs(now - date);
    const diffMinutes = Math.floor(diff / (1000 * 60));
    
    if (diffMinutes < 1) {
      return '刚刚';
    } else if (diffMinutes < 60) {
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

  // 分享配置 - 优化分享内容
  onShareAppMessage() {
    const { message, shareTitle, type, timestamp } = this.data;
    
    return {
      title: shareTitle,
      path: `/pages/shared/shared?message=${encodeURIComponent(message)}&type=${type}&timestamp=${timestamp}`,
      imageUrl: '',
      success: (res) => {
        console.log('分享成功', res);
        wx.showToast({
          title: '分享成功！',
          icon: 'success'
        });
      },
      fail: (error) => {
        console.error('分享失败', error);
      }
    };
  },

  // 处理Web邀请
  handleWebInvite(inviteUrl, groupName) {
    this.setData({
      message: `🏠 邀请您加入洗衣机群组：${groupName}`,
      shareTitle: `邀请加入 ${groupName}`,
      showWebInvite: true,
      inviteUrl: inviteUrl
    });
  },

  // 打开Web邀请页面
  openWebInvite() {
    const { inviteUrl } = this.data;
    
    wx.setClipboardData({
      data: inviteUrl,
      success: () => {
        wx.showModal({
          title: '🔗 邀请链接已复制',
          content: '邀请链接已复制到剪贴板\n\n请在浏览器中打开查看精美的邀请页面！',
          confirmText: '知道了',
          showCancel: false
        });
      }
    });
  }
}); 