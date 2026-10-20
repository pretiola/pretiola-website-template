# Builder stage
FROM rust:1-slim-bookworm AS builder

WORKDIR /app

# Copy over manifests
COPY Cargo.toml Cargo.lock ./

# Cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release --locked
RUN rm -rf src

# Copy source tree
COPY src src

# Build for release
RUN touch src/main.rs && cargo build --release --locked

# Asset build stage (CSS + optimized images)
FROM node:24-bookworm-slim AS asset-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY templates templates
COPY static static
COPY scripts scripts
RUN npm run build

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/target/release/pretiola /usr/local/bin/

# Copy standard setup
COPY static /app/static
COPY templates /app/templates
# Override with compiled css and optimized images from asset-builder
COPY --from=asset-builder /app/static/css/tailwind.css /app/static/css/tailwind.css
COPY --from=asset-builder /app/static/pictures/optimized/ /app/static/pictures/optimized/

ENV RUST_LOG="info"
EXPOSE 8080

CMD ["pretiola"]
