const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    const dbPath = path.join(__dirname, '../database/washing_machine.db');
    this.db = new sqlite3.Database(dbPath);
    this.init();
  }

  // 初始化数据库表
  init() {
    // 洗衣机状态表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS washing_machine_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        status TEXT NOT NULL DEFAULT 'idle',
        current_user_id TEXT,
        current_user_name TEXT,
        start_time DATETIME,
        estimated_end_time DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 使用历史表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS usage_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        start_time DATETIME NOT NULL,
        end_time DATETIME,
        estimated_duration INTEGER,
        actual_duration INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 预约表
    this.db.run(`
      CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        reserved_time DATETIME NOT NULL,
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 初始化洗衣机状态（如果不存在）
    this.db.get("SELECT COUNT(*) as count FROM washing_machine_status", (err, row) => {
      if (err) {
        console.error('数据库查询错误:', err);
        return;
      }
      
      if (!row || row.count === 0) {
        this.db.run(`
          INSERT INTO washing_machine_status (status) VALUES ('idle')
        `, (err) => {
          if (err) {
            console.error('初始化洗衣机状态失败:', err);
          } else {
            console.log('洗衣机状态初始化完成');
          }
        });
      }
    });
  }

  // 获取洗衣机当前状态
  getWashingMachineStatus() {
    return new Promise((resolve, reject) => {
      this.db.get(`
        SELECT * FROM washing_machine_status 
        ORDER BY updated_at DESC 
        LIMIT 1
      `, (err, row) => {
        if (err) {
          reject(err);
        } else {
          // 同时获取当前预约信息
          this.db.all(`
            SELECT * FROM reservations 
            WHERE status = 'active' 
            ORDER BY reserved_time ASC
          `, (err, reservations) => {
            if (err) {
              reject(err);
            } else {
              resolve({
                ...row,
                reservations: reservations || []
              });
            }
          });
        }
      });
    });
  }

  // 开始使用洗衣机
  startUsing(userId, userName, estimatedTime = 60) {
    return new Promise((resolve, reject) => {
      const startTime = new Date().toISOString();
      const estimatedEndTime = new Date(Date.now() + estimatedTime * 60 * 1000).toISOString();

      // 更新洗衣机状态
      this.db.run(`
        UPDATE washing_machine_status 
        SET status = 'in_use',
            current_user_id = ?,
            current_user_name = ?,
            start_time = ?,
            estimated_end_time = ?,
            updated_at = CURRENT_TIMESTAMP
      `, [userId, userName, startTime, estimatedEndTime], (err) => {
        if (err) {
          reject(err);
        } else {
          // 记录使用历史
          this.db.run(`
            INSERT INTO usage_history (user_id, user_name, start_time, estimated_duration)
            VALUES (?, ?, ?, ?)
          `, [userId, userName, startTime, estimatedTime], (err) => {
            if (err) {
              reject(err);
            } else {
              resolve({
                message: '开始使用洗衣机',
                startTime,
                estimatedEndTime,
                estimatedDuration: estimatedTime
              });
            }
          });
        }
      });
    });
  }

  // 完成使用洗衣机
  finishUsing(userId) {
    return new Promise((resolve, reject) => {
      const endTime = new Date().toISOString();

      // 首先获取当前使用信息
      this.db.get(`
        SELECT start_time FROM washing_machine_status 
        WHERE current_user_id = ? AND status = 'in_use'
      `, [userId], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        if (!row) {
          reject(new Error('未找到使用记录或您不是当前使用者'));
          return;
        }

        const actualDuration = Math.round((new Date(endTime) - new Date(row.start_time)) / (1000 * 60));

        // 更新洗衣机状态为空闲
        this.db.run(`
          UPDATE washing_machine_status 
          SET status = 'idle',
              current_user_id = NULL,
              current_user_name = NULL,
              start_time = NULL,
              estimated_end_time = NULL,
              updated_at = CURRENT_TIMESTAMP
        `, (err) => {
          if (err) {
            reject(err);
          } else {
            // 更新使用历史
            this.db.run(`
              UPDATE usage_history 
              SET end_time = ?, actual_duration = ?
              WHERE id = (
                SELECT id FROM usage_history 
                WHERE user_id = ? AND end_time IS NULL 
                ORDER BY start_time DESC 
                LIMIT 1
              )
            `, [endTime, actualDuration, userId], (err) => {
              if (err) {
                reject(err);
              } else {
                resolve({
                  message: '洗衣机使用完成',
                  endTime,
                  actualDuration
                });
              }
            });
          }
        });
      });
    });
  }

  // 获取使用历史
  getUsageHistory(limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM usage_history 
        ORDER BY start_time DESC 
        LIMIT ?
      `, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // 预约洗衣机
  makeReservation(userId, userName, reservedTime) {
    return new Promise((resolve, reject) => {
      this.db.run(`
        INSERT INTO reservations (user_id, user_name, reserved_time)
        VALUES (?, ?, ?)
      `, [userId, userName, reservedTime], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            message: '预约成功',
            reservedTime
          });
        }
      });
    });
  }

  // 关闭数据库连接
  close() {
    this.db.close();
  }
}

module.exports = Database; 