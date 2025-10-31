import express from 'express';
import authRoutes from './routes/authRoutes.js';
import schoolRoutes from './routes/schoolRoutes.js';
import studentRoutes from './routes/studentRoutes.js';

const app = express();
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/schools', schoolRoutes);
app.use('/api/students', studentRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
