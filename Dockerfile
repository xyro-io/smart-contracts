ARG NODE_VERSION=node:20.10-alpine

# build dependecies
FROM --platform=linux/amd64 ${NODE_VERSION} as deps

WORKDIR /app

COPY . .

RUN npm install -g ganache-cli

RUN ganache-cli --account '0xb181b71e57dee6063f0dc40376007a071dc55640998fc31b7c451497465bbd23,100000000000000000000' --account '0xab37fb15374ebcd4b9ce4b9445980a4e55bff31cb587159729670b877b24cc5c,100000000000000000000' --blockTime=1

EXPOSE 8584