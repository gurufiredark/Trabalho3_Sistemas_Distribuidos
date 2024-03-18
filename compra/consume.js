const axios = require('axios');
const Eureka = require('eureka-js-client').Eureka;
const express = require('express');

const app = express();
app.use(express.json());

const port = 4002;
const client = new Eureka({
    instance: {
        app: 'consume-service',
        instanceId: 'consume-service',
        hostName: 'localhost',
        ipAddr: '127.0.0.1',
        statusPageUrl: 'http://localhost:4002',
        port: {
          '$': port,
          '@enabled': 'true',
        },
        vipAddress: 'consume-service',
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

client.start();

let currentIndex = 0;

async function callOtherService(id, quantidade) {

  await new Promise(f => setTimeout(f, 1000));

  const instances = client.getInstancesByAppId('compra-service');

  if (instances.length > 0) {
      const instance = instances[currentIndex % instances.length];
      currentIndex++;  

      try {
      
      const response =  await axios.post(`http://${instance.hostName}:${instance.port.$}/compra`, { id:id, quantidade: quantidade });
      return (response.data);
      } catch (error) {
      if(error instanceof axios.AxiosError) {
        if (error.response != null){
          if (error.response.status === 400)
          return 'Produto indisponível. Quantidade em estoque insuficiente.';
          if (error.response.status === 404)
          return 'Produto com o ID não encontrado.';
          if (error.response.status === 500)
          return 'Erro interno ao processar a compra.';
          }
        return callOtherService(id, quantidade);
      }
      return 'Error making request';
      }
  } else {
      return 'No instances available';
  }

}

app.post('/consume', async (req, res) => {
  const { id, quantidade } = req.body;
  res.status(200).json({ mensagem: await callOtherService(id, quantidade) });
} );

app.listen(port, () => {
  console.log(`Consume service listening at http://localhost:${port}`);
});
