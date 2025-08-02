// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');

// const app = express();
// const server = http.createServer(app);
// const io = new Server(server, {
//   cors: {
//     origin: ['http://localhost:3000', 'http://localhost:5173'],
//     methods: ['GET', 'POST'],
//   },
// });

// let dashboardSchema = [
//   { id: '1', type: 'text', x: 10, y: 10, width: 200, height: 100, content: 'Sample Text' },
//   { id: '2', type: 'chart', x: 220, y: 10, width: 300, height: 200, data: { labels: ['Jan', 'Feb', 'Mar', 'Apr'], datasets: [{ label: 'Sample Data', data: [10, 20, 30, 40], backgroundColor: 'rgba(75, 192, 192, 0.2)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1 }] } },
// ];

// // Simulate persistence (in-memory for demo)
// const saveDashboard = (schema) => {
//   console.log('Saving dashboard:', JSON.stringify(schema, null, 2));
//   dashboardSchema = schema;
// };

// io.on('connection', (socket) => {
//   console.log('User connected:', socket.id);
//   socket.emit('widget-update', dashboardSchema);
//   socket.on('widget-update', (updatedWidgets) => {
//     console.log('Server received widget-update:', JSON.stringify(updatedWidgets, null, 2));
//     const validWidgets = updatedWidgets.filter(w => w.id && w.type && ['text', 'chart'].includes(w.type));
//     saveDashboard(validWidgets);
//     console.log('Server updated dashboardSchema:', JSON.stringify(dashboardSchema, null, 2));
//     io.emit('widget-update', dashboardSchema);
//   });
//   socket.on('disconnect', () => {
//     console.log('User disconnected:', socket.id);
//   });
// });

// server.listen(3001, () => {
//   console.log('Server running on http://localhost:3001');
// });


const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

const mongoUrl = 'mongodb://localhost:27017';
const client = new MongoClient(mongoUrl);
const dbName = 'dashboardDB';
let db;

async function connectToMongo() {
  try {
    await client.connect();
    db = client.db(dbName);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}

connectToMongo();

const saveDashboard = async (schema) => {
  try {
    const collection = db.collection('dashboards');
    await collection.updateOne({ _id: 'default' }, { $set: { widgets: schema } }, { upsert: true });
    console.log('Saved dashboard to MongoDB');
  } catch (err) {
    console.error('Error saving dashboard:', err);
  }
};

const loadDashboard = async () => {
  try {
    const collection = db.collection('dashboards');
    const doc = await collection.findOne({ _id: 'default' });
    return doc ? doc.widgets : [
      { id: '1', type: 'text', x: 10, y: 10, width: 200, height: 100, content: 'Sample Text' },
      { id: '2', type: 'chart', x: 220, y: 10, width: 300, height: 200, data: { labels: ['Jan', 'Feb', 'Mar', 'Apr'], datasets: [{ label: 'Sample Data', data: [10, 20, 30, 40], backgroundColor: 'rgba(75, 192, 192, 0.2)', borderColor: 'rgba(75, 192, 192, 1)', borderWidth: 1 }] } },
    ];
  } catch (err) {
    console.error('Error loading dashboard:', err);
    return [];
  }
};

app.get('/health', (req, res) => {
  res.status(200).send('Server is running');
});

io.on('connection', async (socket) => {
  console.log('User connected:', socket.id, 'Origin:', socket.handshake.headers.origin);
  const dashboardSchema = await loadDashboard();
  socket.emit('widget-update', dashboardSchema);
  socket.on('widget-update', async (updatedWidgets) => {
    console.log('Received widget-update:', JSON.stringify(updatedWidgets, null, 2));
    const validWidgets = updatedWidgets.filter(w => w.id && w.type && ['text', 'chart'].includes(w.type));
    await saveDashboard(validWidgets);
    io.emit('widget-update', validWidgets);
  });
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
  socket.on('error', (error) => {
    console.error('Socket.IO server error:', error.message, error);
  });
});

server.on('error', (error) => {
  console.error('HTTP server error:', error.message);
});

server.listen(3001, () => {
  console.log('Server running on http://localhost:3001');
});
