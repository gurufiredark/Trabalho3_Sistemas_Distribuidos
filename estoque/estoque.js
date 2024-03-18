const express = require('express');
const { MongoClient } = require('mongodb');
const amqp = require('amqplib');
const Eureka = require('eureka-js-client').Eureka;

const app = express();
const port = 4001;
let db;
let channel;

app.use(express.json());

// Conexão com o banco
async function initializeDatabase() {
  const produtos = new MongoClient('mongodb+srv://gabriel:118038@trabsd.bivozhe.mongodb.net/?retryWrites=true&w=majority', 
  { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await produtos.connect();
    db = produtos.db('mydb');
    console.log('Conectado ao banco de dados MongoDB.');
  } catch (error) {
    console.error('Erro ao conectar ao banco de dados MongoDB:', error);
    throw error;
  }
}

// Conexão com o RabbitMQ
async function connectToRabbitMQ() {
  try {
    const connection = await amqp.connect('amqp://localhost');
    channel = await connection.createChannel();
    const compraQueue = 'compraQueue';

    await channel.assertQueue(compraQueue, { durable: false });
    console.log(`Aguardando mensagens em ${compraQueue}`);

    channel.consume(compraQueue, processarMensagemCompra, { noAck: true });
  } catch (error) {
    console.error('Erro ao conectar ao RabbitMQ:', error);
    throw error;
  }
}

async function processarMensagemCompra(mensagem) {
  try {
    const { id, nome, quantidade } = JSON.parse(mensagem.content.toString());

    // Verificar se o produto existe no estoque
    const produtoNoEstoque = await db.collection('produtos').findOne({ id: id });

    if (!produtoNoEstoque) {
      console.log(`Produto ${produtoNoEstoque.nome} não encontrado no estoque.`);
      return;
    }

    // Verifica se há quantidade suficiente em estoque
    if (produtoNoEstoque.quantidade < quantidade) {
      console.log(`Estoque insuficiente para o produto ${produtoNoEstoque.nome}.`);
      return;
    }

    // Atualiza a quantidade em estoque no MongoDB
    await db.collection('produtos').updateOne(
      { id: id },
      { $inc: { quantidade: -quantidade } }
    );
    
    // Lógica de processamento da mensagem de compra
    console.log(`Processando mensagem de compra para o produto ${produtoNoEstoque.nome}`);
  } catch (error) {
    console.error('Erro ao processar mensagem de compra:', error);
  }
}

app.get('/produtos', async (req, res) => {
  try {
    const produtos = await db.collection('produtos').find().toArray();
    res.json(produtos);
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ mensagem: 'Erro interno ao buscar produtos.' });
  }
});

// Configuração do cliente Eureka
const client = new Eureka({
  instance: {
    app: 'estoque-service',
    instanceId: 'estoque-service',
    hostName: 'localhost',
    ipAddr: '127.0.0.1',
    statusPageUrl: 'http://localhost:4001',
    port: {
      '$': port,
      '@enabled': 'true',
    },
    vipAddress: 'estoque-service',
    dataCenterInfo: {
      '@class': 'com.netflix.appinfo.InstanceInfo$DefaultDataCenterInfo',
      name: 'MyOwn',
    },
  },
  eureka: {
    host: 'localhost',
    port: 8761,
    servicePath: '/eureka/apps/',
  },
});

// Registro no Eureka
client.start();

initializeDatabase().then(() => {
  connectToRabbitMQ();
  app.listen(port, () => {
    console.log(`Serviço de Estoque de Produtos rodando em http://localhost:${port}`);
  });
});