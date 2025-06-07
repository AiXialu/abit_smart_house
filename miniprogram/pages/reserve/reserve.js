const app = getApp();

Page({
  data: {
    selectedDate: '',
    selectedTime: '',
    todayDate: '',
    canReserve: false,
    myReservations: [],
    allReservations: [],
    userInfo: null
  },

  onLoad() {
    this.setData({
      userInfo: app.globalData.userInfo,
      todayDate: this.getTodayDate()
    });
    this.loadReservations();
  },

  onShow() {
    this.loadReservations();
  },

  // 实现刷新功能供WebSocket调用
  onRefresh() {
    this.loadReservations();
  },

  // 获取今天的日期
  getTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 日期选择
  onDateChange(e) {
    this.setData({
      selectedDate: e.detail.value
    });
    this.checkCanReserve();
  },

  // 时间选择
  onTimeChange(e) {
    this.setData({
      selectedTime: e.detail.value
    });
    this.checkCanReserve();
  },

  // 检查是否可以预约
  checkCanReserve() {
    const { selectedDate, selectedTime } = this.data;
    this.setData({
      canReserve: selectedDate && selectedTime
    });
  },

  // 加载预约信息
  async loadReservations() {
    try {
      // 获取洗衣机状态（包含预约信息）
      const statusData = await app.request({
        url: '/api/status'
      });
      
      const userInfo = this.data.userInfo;
      const allReservations = statusData.reservations || [];
      
      // 筛选我的预约
      const myReservations = userInfo ? 
        allReservations.filter(item => item.user_name === userInfo.nickName) : [];
      
      this.setData({
        allReservations,
        myReservations
      });
      
    } catch (error) {
      console.error('加载预约信息失败', error);
      wx.showToast({
        title: '加载失败',
        icon: 'error'
      });
    }
  },

  // 提交预约
  async makeReservation() {
    const { selectedDate, selectedTime, userInfo } = this.data;
    
    if (!userInfo) {
      wx.showModal({
        title: '提示',
        content: '请先获取用户信息',
        showCancel: false
      });
      return;
    }

    if (!selectedDate || !selectedTime) {
      wx.showToast({
        title: '请选择日期和时间',
        icon: 'none'
      });
      return;
    }

    // 检查预约时间是否已过
    const reservedTime = new Date(`${selectedDate} ${selectedTime}`);
    const now = new Date();
    
    if (reservedTime <= now) {
      wx.showToast({
        title: '预约时间不能早于当前时间',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '提交中...' });

    try {
      await app.request({
        url: '/api/reserve',
        method: 'POST',
        data: {
          userId: userInfo.nickName,
          userName: userInfo.nickName,
          reservedTime: reservedTime.toISOString()
        }
      });

      wx.showToast({
        title: '预约成功',
        icon: 'success'
      });

      // 重置表单
      this.setData({
        selectedDate: '',
        selectedTime: '',
        canReserve: false
      });

      // 刷新预约列表
      this.loadReservations();

    } catch (error) {
      console.error('预约失败', error);
      wx.showToast({
        title: error.message || '预约失败',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  // 取消预约
  async cancelReservation(e) {
    const reservationId = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认',
      content: '确定要取消这个预约吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            // 这里需要添加取消预约的API
            wx.showToast({
              title: '取消成功',
              icon: 'success'
            });
            
            this.loadReservations();
          } catch (error) {
            console.error('取消预约失败', error);
            wx.showToast({
              title: '取消失败',
              icon: 'error'
            });
          }
        }
      }
    });
  },

  // 格式化时间
  formatTime(timeStr) {
    if (!timeStr) return '';
    
    const date = new Date(timeStr);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  // 获取状态文本
  getStatusText(status) {
    switch (status) {
      case 'active':
        return '待使用';
      case 'completed':
        return '已完成';
      case 'cancelled':
        return '已取消';
      default:
        return '未知';
    }
  }
}); 