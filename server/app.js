const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const WebSocket = require('ws');
const http = require('http');
const Database = require('./database');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

// 初始化数据库
const db = new Database();

// WebSocket连接管理
const clients = new Set();

// 在内存中存储群组和成员数据（生产环境应使用数据库）
const groups = new Map(); // groupId -> group info
const groupMembers = new Map(); // groupId -> members array

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log('新的WebSocket连接');
  
  ws.on('close', () => {
    clients.delete(ws);
    console.log('WebSocket连接关闭');
  });
});

// 广播消息给所有连接的客户端
function broadcast(message) {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// API路由

// 获取洗衣机状态
app.get('/api/status', async (req, res) => {
  try {
    const status = await db.getWashingMachineStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 开始使用洗衣机
app.post('/api/start-using', async (req, res) => {
  try {
    const { userId, userName, estimatedTime } = req.body;
    
    // 检查洗衣机是否空闲
    const currentStatus = await db.getWashingMachineStatus();
    if (currentStatus.status !== 'idle') {
      return res.json({ success: false, error: '洗衣机正在使用中' });
    }
    
    // 开始使用
    const result = await db.startUsing(userId, userName, estimatedTime);
    
    // 广播状态更新
    broadcast({
      type: 'status_update',
      data: await db.getWashingMachineStatus()
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 完成使用洗衣机
app.post('/api/finish-using', async (req, res) => {
  try {
    const { userId } = req.body;
    
    const result = await db.finishUsing(userId);
    
    // 广播状态更新和完成通知
    const newStatus = await db.getWashingMachineStatus();
    broadcast({
      type: 'usage_completed',
      data: {
        status: newStatus,
        message: '洗衣机使用完成，现在可以使用了！'
      }
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取使用历史
app.get('/api/history', async (req, res) => {
  try {
    const history = await db.getUsageHistory();
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 预约洗衣机
app.post('/api/reserve', async (req, res) => {
  try {
    const { userId, userName, reservedTime } = req.body;
    
    const result = await db.makeReservation(userId, userName, reservedTime);
    
    // 广播预约通知
    broadcast({
      type: 'reservation_made',
      data: result
    });
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 获取通知模板
app.get('/api/notify-templates', (req, res) => {
  const templates = {
    statusIdle: '@所有人 🧺洗衣机现在是空闲状态，可以使用～',
    statusInUse: '@所有人 🧺洗衣机正在使用中，使用者：{userName}，预计{remainingTime}后完成',
    askWhenFinish: '@{userName} 有人想用洗衣机，你大概还需要多久呢？🤔',
    washingStarted: '@所有人 🧺洗衣机开始使用，预计{duration}分钟后完成，使用者：{userName}',
    washingFinished: '@所有人 ✅洗衣机使用完成，现在可以使用了～刚才使用者：{userName}',
    reminderBefore: '@{userName} 洗衣预计还有{minutes}分钟完成，记得及时处理哦～',
    reminderOvertime: '@所有人 ⏰洗衣机使用时间已超过预计时间，请{userName}确认是否继续使用',
    customReminder: '@所有人 📢 {customMessage}'
  };
  
  res.json(templates);
});

// 更新通知模板
app.post('/api/notify-templates', (req, res) => {
  const { templates } = req.body;
  
  // 这里可以将模板保存到数据库
  // 目前仅返回成功状态
  res.json({ 
    success: true, 
    message: '通知模板已更新',
    templates: templates
  });
});

// 生成智能通知消息
app.post('/api/generate-notify', (req, res) => {
  const { type, data } = req.body;
  
  const templates = {
    statusIdle: '@所有人 🧺洗衣机现在是空闲状态，可以使用～',
    statusInUse: '@所有人 🧺洗衣机正在使用中，使用者：{userName}，预计{remainingTime}后完成',
    askWhenFinish: '@{userName} 有人想用洗衣机，你大概还需要多久呢？🤔',
    washingStarted: '@所有人 🧺洗衣机开始使用，预计{duration}分钟后完成，使用者：{userName}',
    washingFinished: '@所有人 ✅洗衣机使用完成，现在可以使用了～刚才使用者：{userName}',
    reminderBefore: '@{userName} 洗衣预计还有{minutes}分钟完成，记得及时处理哦～',
    reminderOvertime: '@所有人 ⏰洗衣机使用时间已超过预计时间，请{userName}确认是否继续使用'
  };
  
  let message = templates[type] || '';
  
  // 替换模板变量
  if (data) {
    Object.keys(data).forEach(key => {
      message = message.replace(new RegExp(`{${key}}`, 'g'), data[key]);
    });
  }
  
  res.json({
    success: true,
    message: message,
    timestamp: new Date().toISOString()
  });
});

// 设置定时提醒
app.post('/api/set-reminder', (req, res) => {
  const { userId, userName, reminderTime, message } = req.body;
  
  // 这里可以设置定时任务
  // 目前仅返回成功状态
  res.json({
    success: true,
    message: '提醒设置成功',
    reminderTime: reminderTime,
    userId: userId
  });
});

// 取消定时提醒
app.post('/api/cancel-reminder', (req, res) => {
  const { userId } = req.body;
  
  // 这里可以取消定时任务
  res.json({
    success: true,
    message: '提醒已取消',
    userId: userId
  });
});

// 创建群组
app.post('/api/group/create', async (req, res) => {
  try {
    const { name, ownerId, ownerName } = req.body;
    
    // 创建群组
    const groupId = Date.now().toString();
    const group = {
      id: groupId,
      name: name,
      ownerId: ownerId,
      ownerName: ownerName,
      created_at: new Date().toISOString(),
      memberCount: 1
    };
    
    // 保存群组信息
    groups.set(groupId, group);
    console.log('创建群组:', group);
    
    // 添加创建者为群成员
    const member = {
      groupId: groupId,
      userId: ownerId,
      userName: ownerName,
      role: 'owner',
      joined_at: new Date().toISOString()
    };
    
    // 初始化成员列表
    groupMembers.set(groupId, [member]);
    console.log('添加群主为成员:', member);
    
    res.json({
      success: true,
      data: { group }
    });
    
  } catch (error) {
    console.error('创建群组失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '创建群组失败'
    });
  }
});

// 加入群组
app.post('/api/group/join', async (req, res) => {
  try {
    const { groupCode, userId, userName } = req.body;
    
    // 查找群组
    const group = groups.get(groupCode);
    if (!group) {
      return res.status(404).json({
        success: false,
        error: '群组不存在'
      });
    }
    
    // 检查是否已经是成员
    const members = groupMembers.get(groupCode) || [];
    const existingMember = members.find(m => m.userId === userId);
    
    if (existingMember) {
      return res.json({
        success: true,
        data: { group },
        message: '您已经是群成员了'
      });
    }
    
    // 添加新成员
    const newMember = {
      groupId: groupCode,
      userId: userId,
      userName: userName,
      role: 'member',
      joined_at: new Date().toISOString()
    };
    
    members.push(newMember);
    groupMembers.set(groupCode, members);
    
    // 更新群组成员数量
    group.memberCount = members.length;
    groups.set(groupCode, group);
    
    console.log('用户加入群组:', newMember);
    console.log(`群组 ${group.name} 现有成员数: ${members.length}`);
    
    res.json({
      success: true,
      data: { group }
    });
    
  } catch (error) {
    console.error('加入群组失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '加入群组失败'
    });
  }
});

// 获取群组成员
app.get('/api/group/:groupId/members', async (req, res) => {
  try {
    const { groupId } = req.params;
    
    console.log(`获取群组 ${groupId} 的成员列表`);
    
    // 获取真实的群组成员数据
    const members = groupMembers.get(groupId) || [];
    
    console.log(`群组 ${groupId} 成员数据:`, members);
    
    res.json({
      success: true,
      data: { members }
    });
    
  } catch (error) {
    console.error('获取群组成员失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 退出群组
app.post('/api/group/leave', async (req, res) => {
  try {
    const { groupId, userId } = req.body;
    
    const members = groupMembers.get(groupId) || [];
    const memberIndex = members.findIndex(m => m.userId === userId);
    
    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        error: '您不是该群组成员'
      });
    }
    
    // 移除成员
    const removedMember = members.splice(memberIndex, 1)[0];
    groupMembers.set(groupId, members);
    
    // 更新群组成员数量
    const group = groups.get(groupId);
    if (group) {
      group.memberCount = members.length;
      groups.set(groupId, group);
    }
    
    console.log(`用户 ${userId} 退出群组 ${groupId}，剩余成员: ${members.length}`);
    
    res.json({
      success: true,
      message: '已退出群组'
    });
    
  } catch (error) {
    console.error('退出群组失败:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取在线用户列表
app.get('/api/online-users', async (req, res) => {
  try {
    // 模拟在线用户数据
    const users = [
      { userId: 'user_001', userName: '张三', status: 'online' },
      { userId: 'user_002', userName: '李四', status: 'online' },
      { userId: 'user_003', userName: '王五', status: 'online' }
    ];
    
    res.json({
      success: true,
      data: { users }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 发送群组通知
app.post('/api/send-group-notification', async (req, res) => {
  try {
    const { message, type, groupId, targetMembers, userId, userName } = req.body;
    
    // 创建通知记录
    const notification = {
      id: Date.now(),
      message: message,
      type: type,
      groupId: groupId,
      targetMembers: targetMembers || [],
      senderId: userId,
      senderName: userName,
      timestamp: new Date().toISOString()
    };
    
    console.log('发送群组通知:', notification);
    
    // 向目标成员发送WebSocket通知
    const notificationData = {
      type: 'in_app_notification',
      data: {
        id: notification.id,
        message: notification.message,
        groupId: notification.groupId,
        senderName: notification.senderName,
        timestamp: notification.timestamp
      }
    };
    
    // 广播给所有连接的客户端（实际应该只发给目标成员）
    broadcast(notificationData);
    
    res.json({
      success: true,
      data: notification,
      notifiedUsers: targetMembers.length
    });
    
  } catch (error) {
    console.error('发送群组通知失败:', error);
    res.status(500).json({
      success: false,
      error: error.message || '发送通知失败'
    });
  }
});

// 用户订阅管理
app.post('/api/subscription', async (req, res) => {
  try {
    const { userId, userName, isSubscribed } = req.body;
    
    console.log(`用户 ${userName}(${userId}) ${isSubscribed ? '开启' : '关闭'} 订阅`);
    
    res.json({
      success: true,
      message: isSubscribed ? '订阅成功' : '取消订阅成功'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    data: { 
      status: 'ok', 
      timestamp: new Date().toISOString() 
    } 
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`洗衣机管理服务器运行在端口 ${PORT}`);
  console.log(`WebSocket服务器已启动`);
  console.log(`本地访问: http://localhost:${PORT}`);
  console.log(`局域网访问: http://10.93.199.165:${PORT}`);
  console.log(`备用访问: http://192.168.255.10:${PORT}`);
}); 