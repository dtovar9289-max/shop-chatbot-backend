const cors = require('cors');

const corsMiddleware = cors({
  origin: '*', 
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
});

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  await runMiddleware(req, res, corsMiddleware);

  if (req.method === 'POST') {
    const { message, history } = req.body;

    let replyText = "¡Hola! Estoy procesando tu solicitud sobre nuestra moda.";
    
    if (message.toLowerCase().includes('hola') || message.toLowerCase().includes('hi')) {
      replyText = "¡Hola! Soy Sofi, tu asistente de moda de JDCOLFASHION. ¿Buscas jeans, fajas o alguna prenda en especial hoy?";
    } else if (message.toLowerCase().includes('talla') || message.toLowerCase().includes('size')) {
      replyText = "Para darte la talla perfecta, te recomiendo usar nuestra guía de tallas interactiva en la página del producto, o me puedes decir tus medidas de cintura y cadera.";
    } else if (message.toLowerCase().includes('descuento') || message.toLowerCase().includes('discount')) {
      replyText = "¡Claro que sí! Puedes usar el código BIENVENIDA en tu carrito para obtener un descuento especial en tu compra de hoy.";
    } else {
      replyText = `Recibí tu mensaje: "${message}". Déjame ayudarte a encontrar los mejores jeans levanta cola o fajas colombianas. ¿Tienes alguna duda de un modelo específico?`;
    }

    return res.status(200).json({ message: replyText });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
