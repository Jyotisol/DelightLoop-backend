const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    methods: ['GET', 'POST'],
  },
});

const mongoUrl = 'mongodb://localhost:27017';
const client = new MongoClient(mongoUrl);
const dbName = 'campaignDB';
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

const saveCampaign = async (schema) => {
  try {
    const collection = db.collection('campaigns');
    const validNodeIds = new Set(schema.nodes.map(n => n.id));
    const sanitizedSchema = {
      nodes: schema.nodes.map(node => ({
        id: node.id,
        type: node.type,
        data: node.data || {}, // Ensure data is always an object
        position: node.position || { x: 0, y: 0 }, // Default position
      })),
      edges: schema.edges.filter(e => e.id && validNodeIds.has(e.source) && validNodeIds.has(e.target)),
    };
    console.log('Saving campaign:', JSON.stringify(sanitizedSchema, null, 2));
    await collection.updateOne({ _id: 'default' }, { $set: sanitizedSchema }, { upsert: true });
    console.log('Saved campaign to MongoDB');
    return sanitizedSchema;
  } catch (err) {
    console.error('Error saving campaign:', err);
    return null;
  }
};

const loadCampaign = async () => {
  try {
    const collection = db.collection('campaigns');
    const doc = await collection.findOne({ _id: 'default' });
    const campaign = doc || {
      nodes: [
        {
          id: '1',
          type: 'email',
          data: { label: 'Welcome Email', content: 'Hello!' },
          position: { x: 50, y: 50 },
        },
        {
          id: '2',
          type: 'delay',
          data: { label: 'Wait 3 Days', days: 3 },
          position: { x: 50, y: 150 },
        },
      ],
      edges: [{ id: 'e1-2', source: '1', target: '2' }],
    };
    console.log('Loaded campaign:', JSON.stringify(campaign, null, 2));
    return campaign;
  } catch (err) {
    console.error('Error loading campaign:', err);
    return { nodes: [], edges: [] };
  }
};

const processUserEvent = async (userId, eventType, campaignId = 'default') => {
  console.log(`Processing event for user ${userId}: ${eventType}`);
  const campaign = await loadCampaign();
  const conditionNode = campaign.nodes.find(n => n.type === 'condition' && n.data.eventType === eventType);
  if (!conditionNode) {
    console.log(`No condition node found for eventType: ${eventType}`);
    return;
  }
  const nextEdge = campaign.edges.find(e => e.source === conditionNode.id);
  if (!nextEdge) {
    console.log(`No edge found from condition node: ${conditionNode.id}`);
    return;
  }
  const nextNode = campaign.nodes.find(n => n.id === nextEdge.target);
  if (!nextNode) {
    console.log(`No target node found for edge: ${nextEdge.id}`);
    return;
  }
  if (nextNode.type === 'email') {
    console.log(`Sending email to user ${userId}: ${nextNode.data.content}`);
    // Simulate email sending
  } else if (nextNode.type === 'delay') {
    console.log(`Scheduling delay for user ${userId}: ${nextNode.data.days} days`);
    setTimeout(async () => {
      console.log(`Delay completed for user ${userId}, proceeding to next node`);
      const updatedCampaign = await loadCampaign();
      const followingEdge = updatedCampaign.edges.find(e => e.source === nextNode.id);
      if (followingEdge) {
        const followingNode = updatedCampaign.nodes.find(n => n.id === followingEdge.target);
        if (followingNode && followingNode.type === 'email') {
          console.log(`Sending email to user ${userId}: ${followingNode.data.content}`);
          // Simulate email sending
        }
      }
    }, nextNode.data.days * 1000); // Simulate days with seconds for testing
  }
};

io.on('connection', async (socket) => {
  console.log('User connected:', socket.id);
  const campaignSchema = await loadCampaign();
  socket.emit('campaign-update', campaignSchema);

  socket.on('campaign-update', async ({ nodes, edges }) => {
    console.log('Received campaign-update:', JSON.stringify({ nodes, edges }, null, 2));
    const campaignSchema = {
      nodes: nodes
        .filter(n => n.id && ['email', 'delay', 'condition'].includes(n.type))
        .map(n => ({
          id: n.id,
          type: n.type,
          data: n.data || {},
          position: n.position || { x: 0, y: 0 },
        })),
      edges: edges.filter(e => e.id && e.source && e.target),
    };
    const savedSchema = await saveCampaign(campaignSchema);
    if (savedSchema) {
      io.emit('campaign-update', savedSchema);
    }
  });

  socket.on('user-event', ({ userId, eventType }) => {
    processUserEvent(userId, eventType);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

server.on('error', (error) => {
  console.error('HTTP server error:', error.message);
});

server.listen(3002, () => {
  console.log('Email server running on http://localhost:3002');
});