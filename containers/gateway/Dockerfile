# AgentaOS Gateway Container
# Caddy reverse proxy for routing requests

FROM docker.io/library/caddy:2-alpine

# Copy Caddyfile from containers/gateway/
COPY containers/gateway/Caddyfile /etc/caddy/Caddyfile

# Copy UI static files
COPY ui/dist /srv/ui

EXPOSE 80

# Health check
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]
