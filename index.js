require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const { verifyMessage } = require('ethers');

const app = express();
const port = process.env.PORT || 4000;

// =======================
// CORS Configurado Corretamente
// =======================
const allowedOrigins = [
  'https://api.chaigergame.com',
  'https://chaigergame.com',
  'https://www.chaigergame.com',
  'https://chaiger.xyz',
  'https://www.chaiger.xyz',
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin.trim())) return callback(null, true);
    return callback(new Error('CORS: Origem não permitida'));
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// =======================
// Middleware Essenciais
// =======================
app.use(bodyParser.json());

// =======================
// PostgreSQL: conexão Railway interna (sem SSL)
// =======================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// =======================
// Criação da Tabela
// =======================
pool.query(`
  CREATE TABLE IF NOT EXISTS user_state (
    wallet TEXT PRIMARY KEY,
    credits NUMERIC DEFAULT 0,
    pendingTBT TEXT DEFAULT '0'
  )
`).then(() => {
  console.log("✅ Tabela 'user_state' pronta.");
}).catch(err => {
  console.error("❌ Erro ao criar/verificar tabela:", err);
});

// =======================
// Teste de Conexão
// =======================
app.get('/', (req, res) => {
  res.json({ status: 'online', message: 'API Tigerblock rodando dentro da Railway!' });
});

// =======================
// GET - Buscar por carteira
// =======================
app.get('/api/user/:wallet', async (req, res) => {
  const { wallet } = req.params;
  try {
    const result = await pool.query('SELECT * FROM user_state WHERE wallet = $1', [wallet]);
    if (result.rowCount === 0) {
      return res.status(404).json({ wallet, credits: 0, pendingTBT: '0' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('❌ Erro ao buscar dados:', err.message);
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
});

// =======================
// POST - Salvar/Atualizar Dados
// =======================
app.post('/api/user/save', async (req, res) => {
  let { wallet, credits, pendingTBT, signature } = req.body;

  console.log('\n📥 Requisição recebida:', { wallet, credits, pendingTBT, signature });

  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ error: 'Wallet inválida ou ausente' });
  }

  credits = Number(credits);
  if (isNaN(credits)) {
    return res.status(400).json({ error: 'Credits deve ser um número válido' });
  }

  if (!pendingTBT || typeof pendingTBT !== 'string') {
    pendingTBT = '0';
  }

  if (signature && typeof signature === 'string') {
    const message = `Update request for wallet: ${wallet}`;
    try {
      const recovered = verifyMessage(message, signature);
      if (recovered.toLowerCase() !== wallet.toLowerCase()) {
        return res.status(401).json({ error: 'Assinatura não corresponde à carteira' });
      }
    } catch (err) {
      console.error('❌ Erro ao verificar assinatura:', err.message);
      return res.status(401).json({ error: 'Assinatura inválida' });
    }
  }

  try {
    await pool.query(
      `INSERT INTO user_state (wallet, credits, pendingTBT)
       VALUES ($1, $2, $3)
       ON CONFLICT(wallet) DO UPDATE
       SET credits = EXCLUDED.credits,
           pendingTBT = EXCLUDED.pendingTBT`,
      [wallet, credits, pendingTBT]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Erro ao salvar no banco de dados:', err.message);
    res.status(500).json({ error: 'Erro ao salvar dados' });
  }
});

// =======================
// Iniciar servidor
// =======================
app.listen(port, () => {
  console.log(`🚀 API Tigerblock online na porta ${port} (Railway)`);  
});
