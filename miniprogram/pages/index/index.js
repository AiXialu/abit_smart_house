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
    userInfo: null
  },

  onLoad() {
    this.setData({
      userInfo: app.globalData.userInfo
    });
    this.loadStatus();
  },

  onShow() {
    this.loadStatus();
  },

  // 实现刷新功能供WebSocket调用
  onRefresh() {
    this.loadStatus();
  },

  // 加载洗衣机状态
  async loadStatus() {
    wx.showLoading({ title: '加载中...' });
    
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
    } finally {
      wx.hideLoading();
    }
  },

  // 检查是否是当前使用者
  checkIsCurrentUser(status) {
    const userInfo = this.data.userInfo;
    if (!userInfo || !status.current_user_id) {
      return false;
    }
    return userInfo.nickName === status.current_user_name;
  },

  // 开始使用洗衣机
  async startUsing() {
    const userInfo = this.data.userInfo;
    if (!userInfo) {
      wx.showModal({
        title: '提示',
        content: '请先获取用户信息',
        showCancel: false
      });
      return;
    }

    // 询问预计使用时间
    wx.showModal({
      title: '开始使用',
      content: '请预估使用时间',
      editable: true,
      placeholderText: '请输入分钟数（默认60分钟）',
      success: async (res) => {
        if (res.confirm) {
          const estimatedTime = parseInt(res.content) || 60;
          
          wx.showLoading({ title: '提交中...' });
          
          try {
            await app.request({
              url: '/api/start-using',
              method: 'POST',
              data: {
                userId: userInfo.nickName,
                userName: userInfo.nickName,
                estimatedTime: estimatedTime
              }
            });
            
            wx.showToast({
              title: '开始使用',
              icon: 'success'
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

  // 完成使用
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
                userId: userInfo.nickName
              }
            });
            
            wx.showToast({
              title: '使用完成',
              icon: 'success'
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

  // 刷新状态
  refreshStatus() {
    this.loadStatus();
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
        return '空闲可用';
      case 'in_use':
        return '使用中';
      case 'maintenance':
        return '维护中';
      default:
        return '未知状态';
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
  }
}); 