import prisma from "../models/prisma.js";

export const createStream = async (req, res) => {
  const { name, description } = req.body;
  try {
    const stream = await prisma.stream.create({
      data: { name, description },
      include: { studentStreams: true },
    });
    res.status(201).json(stream);
  } catch (err) {
    console.error(err);
    if (err.code === "P2002")
      return res.status(400).json({ error: "Name already exists" });
    res.status(500).json({ error: "Failed to create stream" });
  }
};

export const getStreams = async (req, res) => {
  try {
    const streams = await prisma.stream.findMany({
      include: { studentStreams: { include: { student: true } } },
      orderBy: { name: "asc" },
    });
    res.json({ streams });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch streams" });
  }
};

export const getStream = async (req, res) => {
  const { id } = req.params;
  try {
    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(id) },
      include: {
        studentStreams: { include: { student: true, academicYear: true } },
      },
    });
    if (!stream) return res.status(404).json({ error: "Stream not found" });
    res.json(stream);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch stream" });
  }
};

export const updateStream = async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  try {
    const stream = await prisma.stream.update({
      where: { id: parseInt(id) },
      data: { name, description },
    });
    res.json(stream);
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Stream not found" });
    res.status(500).json({ error: "Failed to update stream" });
  }
};

export const deleteStream = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.stream.delete({ where: { id: parseInt(id) } });
    res.json({ message: "Stream deleted", data: { student: true } });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025")
      return res.status(404).json({ error: "Stream not found" });
    res.status(500).json({ error: "Failed to delete stream" });
  }
};
