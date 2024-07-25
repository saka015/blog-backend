const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const User = require("./models/User");
const Post = require("./models/Post");
require("dotenv").config();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const uploadMiddleware = multer({ dest: "uploads/" });
const fs = require("fs");
const app = express();

app.use("/uploads", express.static(__dirname + "/uploads"));

const mongoURI = process.env.MONGO_URI;
const port = process.env.PORT || 4000;

app.use((req, res, next) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://blog-app-frontend-ruddy.vercel.app"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.use(express.json());
app.use(cookieParser());

mongoose
  .connect(mongoURI)
  .then(() => console.log("DB connected!"))
  .catch((error) => console.error("DB connection error:", error));

const salt = bcrypt.genSaltSync(10);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Register route
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, salt);
    const userDoc = await User.create({ username, password: hashedPassword });
    res.json({ message: "User created successfully!", user: userDoc });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login route
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const userDoc = await User.findOne({ username });

    if (!userDoc) {
      return res.status(400).json({ error: "User not found" });
    }

    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (passOk) {
      jwt.sign(
        { username, id: userDoc._id },
        process.env.SECRET_KEY,
        {},
        (err, token) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.cookie("token", token, { httpOnly: true }).json({
            id: userDoc._id,
            username,
          });
        }
      );
    } else {
      res.status(400).json({ error: "Invalid credentials" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Middleware to check JWT
const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Forbidden" });
    }
    req.user = user;
    next();
  });
};

// Check profile route
app.get("/profile", authenticateToken, (req, res) => {
  const { token } = req.cookies;
  jwt.verify(token, process.env.SECRET_KEY, {}, (err, info) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(info);
  });
});

// Logout route
app.post("/logout", (req, res) => {
  res
    .cookie("token", "", { httpOnly: true, expires: new Date(0) })
    .json({ message: "Logged out" });
});

// create a new post

app.post("/post", uploadMiddleware.single("file"), async (req, res) => {
  const { originalname, path } = req.file;
  const parts = originalname.split(".");
  const ext = parts[parts.length - 1];
  const newPath = path + "." + ext;
  fs.renameSync(path, newPath);

  const { token } = req.cookies;
  jwt.verify(token, process.env.SECRET_KEY, {}, async (err, info) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    const { title, summary, content } = req.body;
    const postDoc = await Post.create({
      title,
      summary,
      content,
      cover: newPath,
      author: info.id,
    });
    res.json({ postDoc });
  });
});

// get all posts
app.get("/post", async (req, res) => {
  res.json(
    await Post.find()
      .populate("author", ["username"])
      .sort({ createdAt: -1 })
      .limit(20)
  );
});

// get a single post
app.get("/post/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const postDoc = await Post.findById(id).populate("author", ["username"]);
    if (!postDoc) {
      return res.status(404).json({ message: "Post not found" });
    }
    res.json(postDoc);
  } catch (error) {
    console.error("Error fetching post:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// edit a post
app.put("/post", uploadMiddleware.single("file"), async (req, res) => {
  let newPath = null;
  if (req.file) {
    const { originalname, path } = req.file;
    const parts = originalname.split(".");
    const ext = parts[parts.length - 1];
    newPath = path + "." + ext;
    fs.renameSync(path, newPath);
  }

  const { token } = req.cookies;
  jwt.verify(token, process.env.SECRET_KEY, {}, async (err, info) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const { id, title, summary, content } = req.body;
    const postDoc = await Post.findById(id);
    if (!postDoc) {
      return res.status(404).json({ message: "Post not found" });
    }

    const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);
    if (!isAuthor) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Update the post document fields
    postDoc.title = title;
    postDoc.summary = summary;
    postDoc.content = content;
    postDoc.cover = newPath ? newPath : postDoc.cover;

    // Save the updated post document
    await postDoc.save();

    res.json({ postDoc });
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
