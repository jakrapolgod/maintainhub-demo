# MaintainHub

AI-powered enterprise CMMS (Computerized Maintenance Management System) for managing work orders, assets, and preventive maintenance programs.

**Live URL:** https://maintainhub.vercel.app

---

## Features

- **Work Orders** — Create, assign, and track maintenance tasks across your facility. Table, Kanban, and Calendar views. Infinite scroll. SLA deadline tracking with overdue indicators.
- **AI Work Order Assistant** — Describe a maintenance issue in plain language; Claude drafts a structured work order for review and one-click confirmation.
- **Assets** — Hierarchical asset registry with tree navigation, bulk CSV import/export, QR code scanning, and criticality classification.
- **PM Schedules** — Calendar, meter-based, and condition-based preventive maintenance scheduling. Compliance tracking with per-schedule and overall metrics.
- **Real-time Updates** — Work order status changes broadcast live via Socket.io to all connected clients.
- **Webhook Delivery** — Outbound webhooks with delivery history, retry, and replay support.
- **LDAP / Directory Sync** — Connect enterprise identity providers for automatic user provisioning.

---

## Tech Stack

| Layer        | Technology                                                 |
| ------------ | ---------------------------------------------------------- |
| Frontend     | Next.js 15 (App Router), React 19, Tailwind CSS, shadcn/ui |
| State / Data | TanStack Query, Sonner toasts                              |
| Backend      | Node.js, Fastify, Prisma ORM, PostgreSQL                   |
| Queue        | BullMQ + Redis                                             |
| Real-time    | Socket.io                                                  |
| Monorepo     | Turborepo, pnpm workspaces                                 |

---

## Getting Started

```bash
pnpm install
docker-compose up -d      # PostgreSQL + Redis
pnpm db:migrate
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Built with Claude + Anthropic

This project was built using [Claude Code](https://claude.ai/code) — Anthropic's AI-powered CLI for software engineering.

The AI Work Order Assistant feature is powered by the [Anthropic API](https://docs.anthropic.com), using Claude to parse free-text maintenance descriptions and generate structured work order drafts.

> "Describe the maintenance issue and I'll create a work order for you."
