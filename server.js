// server.js - versão para Cyclic, sem Express
import http from "http";
import fs from "fs";
import path from "path";
import url from "url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Caminhos dos arquivos JSON
const caminhoElevadores = path.resolve(__dirname, "detalhe-pedido.json");
const caminhoClientes = path.resolve(__dirname, "clientes.json");

// Carrega os dados JSON de forma segura
function carregarJSON(caminho) {
  try {
    return JSON.parse(fs.readFileSync(caminho, "utf-8"));
  } catch (error) {
    console.error(`⚠️ Erro ao ler ${caminho}:`, error.message);
    return { clientes: [], funcionarios: [] };
  }
}

let elevadores = carregarJSON(caminhoElevadores);
let clientesData = carregarJSON(caminhoClientes);

// Função para calcular progresso do projeto
function calcularProgressoProjeto(projeto) {
  if (!projeto.dataInicio || !projeto.dataEntregaPrevista) return 0;
  try {
    const hoje = new Date();
    const inicio = new Date(projeto.dataInicio);
    const prevista = new Date(projeto.dataEntregaPrevista);
    const totalDias = (prevista - inicio) / (1000 * 60 * 60 * 24);
    const diasPassados = (hoje - inicio) / (1000 * 60 * 60 * 24);
    if (totalDias <= 0 || diasPassados <= 0) return 0;

    let progresso = (diasPassados / totalDias) * 100;
    if (
      projeto.status.toLowerCase().includes("concluído") ||
      projeto.status.toLowerCase().includes("concluida")
    ) {
      progresso = 100;
    }
    return Math.round(Math.min(100, Math.max(0, progresso)));
  } catch {
    return 0;
  }
}

// Função para gerar dashboard
function gerarDashboard(elevadoresFiltrados = elevadores) {
  if (!Array.isArray(elevadoresFiltrados) || elevadoresFiltrados.length === 0) {
    return {
      instalacoesAtivas: 0,
      custoMedioInstalacao: 0,
      progressoMedioPrazo: "0%",
      taxaSatisfacao: 0,
      instalacoesPais: {},
      statusInstalacao: { ativo: 0, "em trânsito": 0, concluido: 0 },
    };
  }

  const paises = {};
  let statusInstalacao = { ativo: 0, "em trânsito": 0, concluido: 0 };
  let somaCusto = 0,
    somaNotas = 0,
    somaProgresso = 0,
    countCustos = 0,
    countNotas = 0,
    countProgresso = 0;

  elevadoresFiltrados.forEach((e) => {
    const pais = e.localizacao.split(",")[1]?.trim() || e.localizacao;
    paises[pais] = (paises[pais] || 0) + 1;

    const status = e.status?.toLowerCase() || "";
    if (status.includes("fabricação") || status.includes("processo"))
      statusInstalacao.ativo++;
    else if (status.includes("trânsito") || status.includes("caminho"))
      statusInstalacao["em trânsito"]++;
    else if (status.includes("concluído") || status.includes("concluida"))
      statusInstalacao.concluido++;

    if (e.custo && !isNaN(e.custo)) {
      somaCusto += e.custo;
      countCustos++;
    }

    if (e.notaQualidade && !isNaN(e.notaQualidade)) {
      somaNotas += e.notaQualidade;
      countNotas++;
    }

    const progresso = calcularProgressoProjeto(e);
    if (progresso > 0) {
      somaProgresso += progresso;
      countProgresso++;
    }
  });

  return {
    instalacoesAtivas: elevadoresFiltrados.length,
    custoMedioInstalacao: countCustos ? Math.round(somaCusto / countCustos) : 0,
    progressoMedioPrazo: countProgresso
      ? `${Math.round(somaProgresso / countProgresso)}%`
      : "0%",
    taxaSatisfacao: countNotas
      ? parseFloat((somaNotas / countNotas).toFixed(1))
      : 0,
    instalacoesPais: paises,
    statusInstalacao,
  };
}

// Lê o body da requisição
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk.toString()));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// Cria o servidor HTTP
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, PATCH, OPTIONS"
  );
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathName = parsedUrl.pathname;
  const query = parsedUrl.query;

  try {
    // PATCH /atualizar-projeto/:id
    if (pathName.startsWith("/atualizar-projeto/") && req.method === "PATCH") {
      const projetoId = pathName.split("/")[2];
      const body = await readBody(req);
      const { notaQualidade } = JSON.parse(body);

      const projeto = elevadores.find((p) => p.id === projetoId);
      if (!projeto) {
        res.writeHead(404);
        res.end(
          JSON.stringify({ success: false, error: "Projeto não encontrado" })
        );
        return;
      }

      projeto.notaQualidade = notaQualidade;
      projeto.dataAvaliacao = new Date().toISOString();

      fs.writeFileSync(caminhoElevadores, JSON.stringify(elevadores, null, 2));
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, projeto }));
      return;
    }

    // GET /dashboardadmin
    if (pathName === "/dashboardadmin" && req.method === "GET") {
      const dashboard = gerarDashboard(elevadores);
      res.writeHead(200);
      res.end(JSON.stringify(dashboard, null, 2));
      return;
    }

    // GET /clientes
    if (pathName === "/clientes" && req.method === "GET") {
      res.writeHead(200);
      res.end(JSON.stringify(clientesData.clientes, null, 2));
      return;
    }

    // GET /usuarios
    if (pathName === "/usuarios" && req.method === "GET") {
      res.writeHead(200);
      res.end(JSON.stringify(clientesData, null, 2));
      return;
    }

    // POST /login
    if (pathName === "/login" && req.method === "POST") {
      const body = await readBody(req);
      const { email, senha, tipo } = JSON.parse(body);

      const grupo =
        tipo === "cliente" ? clientesData.clientes : clientesData.funcionarios;
      const usuario = grupo.find((u) => u.email === email && u.senha === senha);

      if (!usuario) {
        res.writeHead(401);
        res.end(
          JSON.stringify({ success: false, error: "Credenciais inválidas" })
        );
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify({ success: true, user: { ...usuario, tipo } }));
      return;
    }

    // Rota não encontrada
    res.writeHead(404);
    res.end(JSON.stringify({ erro: "Rota não encontrada" }));
  } catch (error) {
    console.error("❌ Erro:", error);
    res.writeHead(500);
    res.end(JSON.stringify({ erro: "Erro interno do servidor" }));
  }
});

// Porta dinâmica pro Cyclic
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servidor rodando na porta ${PORT}`);
});
