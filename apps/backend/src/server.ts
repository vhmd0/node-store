import { createServer } from 'http';
import app from './app';
import { prisma } from './lib/prisma';
import { initializeSocketIO } from './socket';

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await prisma.$connect();
    console.log('Connected to database');

    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize Socket.IO
    initializeSocketIO(httpServer);
    console.log('Socket.IO initialized');

    httpServer.listen(PORT, () => {
      console.log(`Server running on port http://localhost:${PORT}`);
      console.log(`Server Admin email is : dev@email.com`);
      console.log(`Server Password is : Dev123`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer().catch(console.error);
