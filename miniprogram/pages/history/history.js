const app = getApp();

Page({
  data: {
    historyList: []
  },

  onLoad() {
    this.loadHistory();
  },

  onShow() {
    this.loadHistory();
  },

  // 实现刷新功能供WebSocket调用
  onRefresh() {
    this.loadHistory();
  },

  // 加载使用历史
  async loadHistory() {
    wx.showLoading({ title: '加载中...' });
    
    try {
      const data = await app.request({
        url: '/api/history'
      });
      
      this.setData({
        historyList: data
      });
      
    } catch (error) {
      console.error('加载历史失败', error);
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 刷新历史记录
  refreshHistory() {
    this.loadHistory();
  },

  // 格式化时间
  formatTime(timeStr) {
    if (!timeStr) return '';
    
    const date = new Date(timeStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}); 