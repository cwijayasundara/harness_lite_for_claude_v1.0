FROM node:22.16.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates ripgrep \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global @anthropic-ai/claude-code@2.1.263 \
    && npm cache clean --force
ENV HOME=/session HARNESS_HOME=/plugin/.aidlc
WORKDIR /work
USER node
