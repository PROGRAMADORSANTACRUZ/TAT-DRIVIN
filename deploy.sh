#!/bin/sh
# ============================================================
# DRIVIN-TAT — aplica las etiquetas de Traefik al servicio de
# Dokploy para publicarlo en https://distlog.grupo-santacruz.com
#
# Uso:
#   1) Averigua el nombre del servicio en el servidor:
#        docker service ls | grep tat
#   2) Reemplaza SERVICE por ese nombre (o expórtalo):
#        SERVICE=<nombre-del-servicio> sh deploy.sh
# ============================================================

SERVICE="${SERVICE:-tatdrivin-app}"

docker service update \
  --label-add 'traefik.enable=true' \
  --label-add 'traefik.http.routers.tatdrivin.rule=Host(`distlog.grupo-santacruz.com`)' \
  --label-add 'traefik.http.routers.tatdrivin.entrypoints=websecure' \
  --label-add 'traefik.http.routers.tatdrivin.tls=true' \
  --label-add 'traefik.http.routers.tatdrivin.tls.certresolver=letsencrypt' \
  --label-add 'traefik.http.routers.tatdrivin.service=tatdrivin' \
  --label-add 'traefik.http.services.tatdrivin.loadbalancer.server.port=80' \
  --label-add 'traefik.http.routers.tatdrivin-web.rule=Host(`distlog.grupo-santacruz.com`)' \
  --label-add 'traefik.http.routers.tatdrivin-web.entrypoints=web' \
  --label-add 'traefik.http.routers.tatdrivin-web.middlewares=tatdrivin-redirect-https' \
  --label-add 'traefik.http.middlewares.tatdrivin-redirect-https.redirectscheme.scheme=https' \
  --label-add 'traefik.http.middlewares.tatdrivin-redirect-https.redirectscheme.permanent=true' \
  --label-add 'traefik.docker.network=dokploy-network' \
  "$SERVICE"
