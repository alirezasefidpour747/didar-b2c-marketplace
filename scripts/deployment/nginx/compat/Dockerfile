# Isolated CI compatibility edge. No host installation or implicit Nginx upgrade.
# amd64 manifest; the runtime uses exact SHA-pinned Debian archives from the
# authenticated context produced by fetch-debian.py --runtime-context.
FROM debian:trixie-slim@sha256:918311b7b6c4c6f68b232ba516584925f6c78ad82b6fd534b98979df6438e483
ARG SOURCE_SHA
LABEL org.opencontainers.image.source="https://github.com/alirezasefidpour747/didar-b2c-marketplace" \
      org.opencontainers.image.revision=$SOURCE_SHA \
      org.didar.compat.nginx="1.26.3-3+deb13u9" \
      org.didar.compat.njs="0.8.9-1"
COPY root/ /
RUN test -n "$SOURCE_SHA" && test "${#SOURCE_SHA}" -eq 40 \
    && /usr/sbin/nginx -v && /usr/bin/njs -v && /usr/bin/curl --version \
    && mkdir -p /var/lib/nginx/body /var/lib/nginx/proxy /var/lib/nginx/fastcgi /var/lib/nginx/uwsgi /var/lib/nginx/scgi /run/nginx
STOPSIGNAL SIGQUIT
CMD ["/usr/sbin/nginx", "-g", "daemon off;"]
