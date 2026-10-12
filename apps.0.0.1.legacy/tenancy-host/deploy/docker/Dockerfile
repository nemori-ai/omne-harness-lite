FROM node@sha256:64af3819f9275802414d7cdc38c27e9d82bd564dec4d4da87d008255d36c63b4

COPY app/ /opt/omne/app/

USER 10001:10001
WORKDIR /opt/omne/app
ENTRYPOINT ["node", "/opt/omne/app/dist/cli.js"]
CMD ["serve"]
HEALTHCHECK --interval=30s --timeout=7s --start-period=30s --retries=3 CMD ["node", "/opt/omne/app/deploy/docker/health.mjs"]
