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

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`洗衣机管理服务器运行在端口 ${PORT}`);
  console.log(`WebSocket服务器已启动`);
}); 