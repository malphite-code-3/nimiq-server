const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
class Connection {
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        const { NimiqWrapper } = require('nimiq-wrapper');
        const wrapper = new NimiqWrapper({
          consensusCallback: (status) => {
            if (status === 'established') {
              resolve(wrapper);
            }
          }
        });
        wrapper.initNode({ network: "MAIN" });
      } catch (error) {
        reject(error);
      }
    });
  }
}

const connection = new Connection();
let wrapper;

const getBalance = async (address) => {
  return new Promise((resolve, reject) => {
    try {
      wrapper.accountHelper.getBalance(address, (balance) => {
        resolve(balance / 100000);
      });
    } catch (error) {
      reject(error);
    }
  });
};

const send = async (receiver, privateKey) => new Promise((resolve) => {
  const wallet = wrapper.accountHelper.importWalletFromHexKey(privateKey);
  const address = wallet._keyPair.publicKey.toAddress().toUserFriendlyAddress();
  wrapper.accountHelper.getBalance(address, (amount) => {
    const payload = { address: receiver, amount, fee: 0 }
    const transaction = wrapper.transactionHelper.sendTransaction(wallet, payload)
    resolve({ address, balance: amount, transaction })
  })
})

function proxyMain(ws, req) {
  ws.on('message', async (message) => {
    const command = JSON.parse(message);

    if (command.method === 'wallet_createTransaction') {
      const id = command.id;
      const { privateKey, receiver } = command.params || null;
      const transaction = await send(receiver, privateKey);
      ws.send(JSON.stringify({ id, method: command.method, data: { transaction } }));
    }

    if (command.method === 'wallet_getBalance') {
      const id = command.id;
      const { address } = command.params;
      const balance = await getBalance(address);
      ws.send(JSON.stringify({ id, method: command.method, data: { balance } }));
    }
  });
}

const startServer = async () => {
  try {
    console.log('Connecting to Nimiq network...');
    wrapper = await connection.connect();
    console.log('Connected to Nimiq network!');
    wss.on('connection', proxyMain);

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to connect to Nimiq network', error);
    process.exit(1); // Exit the process if the connection fails
  }
};

startServer();
