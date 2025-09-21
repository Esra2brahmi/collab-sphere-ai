<div align="center">

# **CollabSphereAI: AI-Powered Video Call Platform**

[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=for-the-badge&logo=next.js)](https://nextjs.org/)  
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://reactjs.org/)  
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v4-06B6D4?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)  
[![Stream Video](https://img.shields.io/badge/Stream-VideoSDK-FF6F61?style=for-the-badge)](https://getstream.io/video/)  
[![Better Auth](https://img.shields.io/badge/BetterAuth-Enabled-4FC08D?style=for-the-badge)](#)  
[![Groq](https://img.shields.io/badge/Groq-Integration-008000?style=for-the-badge)](#)

<img width="1920" height="946" alt="image" src="https://github.com/user-attachments/assets/6f9156b3-d03d-4042-bbdd-0c72e9553172" />


**Collaborate smarter — AI-enhanced video calls from start to finish.**

[🚀 Live Demo](#) • [🔧 Installation](#installation)

</div>

---

## ✨ Overview

**CollabSphereAI** is a **Next.js-powered** AI video call platform that lets teams collaborate with **real-time AI agents**, generate **summaries, transcripts, and task boards**, and analyze conversations for expertise, emotions, and role attribution.  

The platform enables:  
- **AI-powered video calls** with custom agents.  
- **Summaries & transcripts** using background jobs.  
- **Meeting history & statuses** with detailed analytics.  
- **Post-call task and role management** generated automatically by AI.  
- **Authentication & subscriptions** with Better Auth.  
- **Mobile-responsive, fully interactive UI** built with Tailwind v4 + Shadcn/ui.  

---

## 🎯 Key Features

### 🤖 AI Video Calls
- Real-time video meetings powered by **Stream Video SDK**.  
- Customizable AI agents for each meeting.  
- Role-based insights, emotional analysis, and expertise detection.

<img width="1920" height="946" alt="image" src="https://github.com/user-attachments/assets/e121664e-6c4f-4676-b535-1032df36480f" />


<img width="1920" height="946" alt="image" src="https://github.com/user-attachments/assets/19e86276-f83a-4f08-a666-f7eac47b1349" />



### 🧠 AI Agents & Analysis
- Background processing with **Inngest jobs**.  
- Summaries, transcripts, and AI Q&A for each meeting.  
- Automatic task & role assignment per user based on conversation.  

<img width="1920" height="946" alt="image" src="https://github.com/user-attachments/assets/42518e8d-ab26-4b94-8f85-cebf70a2c18d" />

<img width="1920" height="946" alt="image" src="https://github.com/user-attachments/assets/dfceee61-6a01-4cb3-96ce-d6dc2ef01307" />



### 📂 Meeting History & Insights
- Store past meetings with transcripts, summaries, and AI-generated boards.  
- Search and filter transcripts by keywords, roles, or user.  
- Insights on user contributions, tasks, and AI recommendations.  

<img width="1920" height="946" alt="image" src="https://github.com/user-attachments/assets/5cfa03f3-c6c1-4619-b0f8-8d2a3f975df4" />


### 🔐 Authentication & Integrations
- Login via **Better Auth**, GitHub, and Google.  
- Groq integration for AI insights.  
- Stream Chat SDK for interactive messaging during calls.  

<img width="1746" height="946" alt="image" src="https://github.com/user-attachments/assets/d26da154-f8b0-4fbc-9b72-bc708eb9f159" />


---

## 🏗️ Architecture

```mermaid
graph TB
    USER[User / Team] --> CALL[Initiate Video Call]
    CALL --> AI_AGENT[Custom AI Agent]
    AI_AGENT --> INNGEST[Inngest Background Jobs]
    INNGEST --> SUMMARY[Generate Summary & Transcript]
    INNGEST --> TASKS[Generate AI Task Board]
    CALL --> STREAM[Stream Video & Chat SDK]
    DB[(PostgreSQL DB)] --> SUMMARY
    DB <-- TASKS
    FRONTEND[Next.js + Tailwind + Shadcn/ui] --> USER
```
---

## 🚀 Technology Stack
- **Frontend:** Next.js 15 + React 19, Tailwind v4, Shadcn/ui
- **Backend / Jobs:** Inngest background jobs, Node.js
- **Video & Chat:** Stream Video SDK, Stream Chat SDK
- **Authentication:** Better Auth, GitHub, Google
- **Database:** PostgreSQL (Neon)
- **AI & NLP:** Groq, custom AI agents
- **Deployment:** Vercel / Cloud (TBD)

---

## ⚡ Quick Start
```bash
# 1. Clone the repository
git clone https://github.com/Esra2brahmi/collabsphereai.git
cd collabsphereai

# 2. Install dependencies
npm install --legacy-peer-deps
# or
yarn install

# 3. Add your `.env` file with API keys and database credentials

# 4. Start the development server
npm run dev
# or
yarn dev


# 5. Open the app
 Visit http://localhost:3000
```


---
## 🛣️ Future Features
- 🔮 Predictive AI insights – automatic detection of key discussion points and follow-ups
- 🌐 Global meeting analytics – visualize team performance and AI recommendations
- 📱 Mobile app integration – seamless AI-assisted collaboration on iOS/Android
- ☁️ Cloud-native scaling – distributed video processing for enterprise teams

## 🏗️ Built In
Made with ❤️ using **Next.js, React, Tailwind, Stream SDKs, and AI tools**

