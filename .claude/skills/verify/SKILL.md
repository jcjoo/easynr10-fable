---
name: verify
description: Como subir e dirigir o EasyNR10 v2 em dev para verificar mudanças de runtime (login, screenshots via Playwright).
---

# Verificação em dev do EasyNR10 v2

## Subir

```bash
docker compose -f docker-compose.dev.yml up -d   # postgres :5433, minio, mailpit, gotenberg
bun run db:migrate                               # o banco dev pode estar com migrations atrasadas
bun run dev                                      # api :3000 + web :5173 (vite proxy /api → 3000)
```

Login: `ADMIN_EMAIL` / `ADMIN_PASSWORD` do `.env` (admin@pso.dev / admin12345).
Seed base: empresa "PSO Engenharia (exemplo)" com "Unidade Matriz".

## Dirigir (Playwright)

Sem playwright no repo — no scratchpad: `bun add playwright-core` e
`chromium.launch({ executablePath: '/usr/bin/chromium', headless: true })`.

Gotchas:
- O redirect `/` → `/login` é client-side: NÃO cheque `page.url()` logo após
  o goto; espere `input[type="email"]` OU o conteúdo autenticado aparecer.
- Após submeter o login, espere `waitForURL(url => !url.pathname.startsWith('/login'))`
  antes de navegar — navegar cedo demais aborta o fetch do sign-in e perde o cookie.

## Dados de fixture

Inserir direto no banco dev com um script `*.tmp.ts` DENTRO de `apps/api/`
(resolução de workspace) rodado com `bun --env-file=../../.env`:
`createDb(process.env.DATABASE_URL)` + inserts via `schema` do `@easynr10/db`.
`diagnostic.authorId` é NOT NULL (use o admin). Limpar depois via psql:
`docker exec easynr10-dev-database-1 psql -U easynr10 -d easynr10 -c "..."`.

Testes de integração (`bun test`) usam o MESMO postgres dev (recriam
`easynr10_test`) — o container precisa estar de pé.
