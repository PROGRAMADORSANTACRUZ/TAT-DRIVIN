docker service update \
  --label-add 'traefik.enable=true' \
  --label-add 'traefik.http.routers.tatdrivin.rule=Host(`distrilog.grupo-santacruz.com`)' \
  --label-add 'traefik.http.routers.tatdrivin.entrypoints=websecure' \
  --label-add 'traefik.http.routers.tatdrivin.tls=true' \
  --label-add 'traefik.http.routers.tatdrivin.tls.certresolver=letsencrypt' \
  --label-add 'traefik.http.routers.tatdrivin.service=tatdrivin' \
  --label-add 'traefik.http.services.tatdrivin.loadbalancer.server.port=80' \
  --label-add 'traefik.http.routers.tatdrivin-web.rule=Host(`distrilog.grupo-santacruz.com`)' \
  --label-add 'traefik.http.routers.tatdrivin-web.entrypoints=web' \
  --label-add 'traefik.http.routers.tatdrivin-web.middlewares=tatdrivin-redirect-https' \
  --label-add 'traefik.http.middlewares.tatdrivin-redirect-https.redirectscheme.scheme=https' \
  --label-add 'traefik.http.middlewares.tatdrivin-redirect-https.redirectscheme.permanent=true' \
  --label-add 'traefik.docker.network=dokploy-network' \
  tat-drivin-tat-drivin-go9t4c
