# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

COPY go.mod ./
COPY main.go ./

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o small-oauth2-proxy main.go

# Runnable stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /app

COPY --from=builder /app/small-oauth2-proxy .

EXPOSE 4180

CMD ["./small-oauth2-proxy"]

