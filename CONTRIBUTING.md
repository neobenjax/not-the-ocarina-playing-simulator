# 🤝 Collaborating & Community Guide

Thank you for checking out **Not The Ocarina Playing Simulator**! Whether you're a musician, a Zelda fan, a web developer, or someone who just wants to share a cool `.ocarina.txt` song chart, you are warmly welcome here.

---

## 💬 How to Reach Out

- **Ideas, Feature Requests & Feedback**: Open a **GitHub Issue** in this repository with a short description of what you'd like to see (new game mechanics, accessibility ideas, audio tweaks, or UI polish).
- **Bug Reports**: Open a **GitHub Issue** with your browser/device (Desktop or Mobile), steps to reproduce, and any console error messages if available.
- **Share Songs & Skins**: Feel free to open an Issue or Pull Request sharing your `.ocarina.txt` partitures or custom SVG ocarina masks!

---

## 🎼 Sharing Partitures (`.ocarina.txt`)

You can export any track from **Mode 1 (Wander & Compose)** as a plain-text `.ocarina.txt` file. Both structured v2 tables and simple inline arrow notation are supported:

```text
# OCARINA PARTITURE v2
TITLE: My Custom Tune
ARTIST: Wandering Bard
BPM: 110
---
# BEAT | HOLE | DURATION | PITCH | NOTE
0.00 | ▼ | 0.50 | normal | F5
0.50 | ▼(Up) | 0.50 | up | F#5
1.00 | ◀ | 1.00 | normal | B5
```

---

## 🧑‍💻 Contributing Code

1. **Fork** the repository and create a branch from `main` (e.g. `feat/my-feature` or `fix/my-fix`).
2. **Install & Run**:
   ```bash
   npm install
   npm run dev
   ```
3. **Verify** your changes before opening a Pull Request:
   ```bash
   npm run typecheck
   npm run build
   npx playwright test
   ```
4. **Open a Pull Request** targeting `main` with a clear summary of your changes.

> **Reminder on Assets & Copyright**: Please keep all contributions original! Do not submit copyrighted Nintendo® sprites, logos, audio files, or trademarked artwork.

---

Happy playing! 🎶
