const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const { verifyMessage } = require('ethers'); // ethers v6

const app = express();
const port = process.env.PORT || 4000;

// =======================
// CORS Configurado Corretamente
// =======================
const allowedOrigins = [
  'https://api.chaigergame.com',
  'https://chaigergame.com',
  'https://www.chaigergame.com',
  'https://www.chaiger.xyz',
  'https://chaiger.xyz',
  'http://localhost:3000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
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
// Banco de Dados SQLite
// =======================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // configure isso no Railway
  ssl: {
    rejectUnauthorized: false
  }
});

// Criar tabela, se não existir
pool.query(`
  CREATE TABLE IF NOT EXISTS user_state (
    wallet TEXT PRIMARY KEY,
    credits NUMERIC DEFAULT 0,
    pendingTBT TEXT DEFAULT '0'
  );
`).catch(err => console.error('❌ Erro ao criar tabela:', err));

// =======================
// Teste de Conexão
// =======================
app.get('/', (req, res) => {
  res.json({ status: 'online', message: 'API Tigerblock Epa com HTTPS!' });
});

// =======================
// GET - Buscar por carteira
// =======================
app.get('/api/user/:wallet', async (req, res) => {
  const { wallet } = req.params;

  try {
    const result = await pool.query('SELECT * FROM user_state WHERE wallet = $1', [wallet]);

    if (result.rows.length === 0) {
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
  const { wallet, credits, pendingTBT, signature } = req.body;

  console.log('\n📥 Requisição recebida:');
  console.log('→ Wallet:', wallet);
  console.log('→ Credits:', credits);
  console.log('→ PendingTBT:', pendingTBT);
  console.log('→ Signature:', signature);
  console.log('→ Mensagem para verificar:', `Update request for wallet: ${wallet}`);

  if (!wallet || !signature) {
    return res.status(400).json({ error: 'Carteira e assinatura obrigatórias' });
  }

  const message = `Update request for wallet: ${wallet}`;

  let recovered;
  try {
    recovered = verifyMessage(message, signature);
  } catch (err) {
    console.error('❌ Erro ao verificar assinatura:', err.message);
    return res.status(401).json({ error: 'Assinatura inválida' });
  }

  if (recovered.toLowerCase() !== wallet.toLowerCase()) {
    console.warn('🚨 Assinatura não corresponde à carteira!');
    return res.status(401).json({ error: 'Assinatura não corresponde à carteira' });
  }

  try {
    await pool.query(`
      INSERT INTO user_state (wallet, credits, pendingTBT)
      VALUES ($1, $2, $3)
      ON CONFLICT(wallet) DO UPDATE SET
        credits = excluded.credits,
        pendingTBT = excluded.pendingTBT
    `, [wallet, credits, pendingTBT]);

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
  console.log(`🚀 API rodando na porta ${port}`);
});
