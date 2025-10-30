// server.js - VERSÃO CORRIGIDA COM ROTA PATCH
import http from "http";
import fs from "fs";
import path from "path";
import url from "url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lê JSON principal
const elevadores = JSON.parse(
  fs.readFileSync(path.join(__dirname, "detalhe-pedido.json"), "utf-8")
);

// Lê JSON de clientes (que agora inclui funcionários)
const clientesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "clientes.json"), "utf-8")
);

// Função para calcular progresso do projeto
function calcularProgressoProjeto(projeto) {
  if (!projeto.dataInicio || !projeto.dataEntregaPrevista) {
    return 0;
  }

  try {
    const hoje = new Date();
    const inicio = new Date(projeto.dataInicio);
    const prevista = new Date(projeto.dataEntregaPrevista);

    const totalDias = (prevista - inicio) / (1000 * 60 * 60 * 24);
    const diasPassados = (hoje - inicio) / (1000 * 60 * 60 * 24);

    if (totalDias > 0 && diasPassados > 0) {
      let progresso = (diasPassados / totalDias) * 100;

      // Limita entre 0% e 100%
      progresso = Math.min(100, Math.max(0, progresso));

      // Para projetos concluídos, força 100%
      if (
        projeto.status.toLowerCase().includes("concluído") ||
        projeto.status.toLowerCase().includes("concluida")
      ) {
        progresso = 100;
      }

      return Math.round(progresso);
    }
  } catch (error) {
    console.log(
      `Erro ao calcular progresso para ${projeto.id}:`,
      error.message
    );
  }

  return 0;
}

// Função para gerar dashboard baseado apenas em dados reais
function gerarDashboard(elevadoresFiltrados = elevadores) {
  if (elevadoresFiltrados.length === 0) {
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
  let somaCusto = 0;
  let countCustos = 0;
  let somaNotas = 0;
  let countNotas = 0;
  let somaProgresso = 0;
  let countProgresso = 0;

  elevadoresFiltrados.forEach((e) => {
    // Extrai país da localização (formato: "Cidade, País")
    const pais = e.localizacao.split(",")[1]?.trim() || e.localizacao;
    paises[pais] = (paises[pais] || 0) + 1;

    // Classifica status baseado nos dados reais
    const statusLower = e.status.toLowerCase();
    if (
      statusLower.includes("fabricação") ||
      statusLower.includes("processo")
    ) {
      statusInstalacao.ativo++;
    } else if (
      statusLower.includes("caminho") ||
      statusLower.includes("trânsito")
    ) {
      statusInstalacao["em trânsito"]++;
    } else if (
      statusLower.includes("concluído") ||
      statusLower.includes("concluida")
    ) {
      statusInstalacao.concluido++;
    }

    // Soma custos (apenas valores numéricos válidos)
    if (
      e.custo !== null &&
      e.custo !== undefined &&
      !isNaN(e.custo) &&
      e.custo > 0
    ) {
      somaCusto += e.custo;
      countCustos++;
    }

    // Soma notas (apenas valores numéricos válidos)
    if (
      e.notaQualidade !== null &&
      e.notaQualidade !== undefined &&
      !isNaN(e.notaQualidade) &&
      e.notaQualidade > 0
    ) {
      somaNotas += e.notaQualidade;
      countNotas++;
    }

    // Calcula progresso baseado em datas reais
    if (e.dataInicio && e.dataEntregaPrevista) {
      try {
        const hoje = new Date();
        const inicio = new Date(e.dataInicio);
        const prevista = new Date(e.dataEntregaPrevista);

        const totalDias = (prevista - inicio) / (1000 * 60 * 60 * 24);
        const diasPassados = (hoje - inicio) / (1000 * 60 * 60 * 24);

        if (totalDias > 0 && diasPassados > 0) {
          let progresso = (diasPassados / totalDias) * 100;

          // Limita entre 0% e 100%
          progresso = Math.min(100, Math.max(0, progresso));

          // Para projetos concluídos, força 100%
          if (
            statusLower.includes("concluído") ||
            statusLower.includes("concluida")
          ) {
            progresso = 100;
          }

          somaProgresso += progresso;
          countProgresso++;
        }
      } catch (error) {
        console.log(`Erro ao calcular progresso para ${e.id}:`, error.message);
      }
    }
  });

  // Cálculos baseados apenas nos dados disponíveis
  const custoMedioInstalacao =
    countCustos > 0 ? Math.round(somaCusto / countCustos) : 0;
  const taxaSatisfacao =
    countNotas > 0 ? (somaNotas / countNotas).toFixed(1) : 0;
  const progressoMedioPrazo =
    countProgresso > 0
      ? `${Math.round(somaProgresso / countProgresso)}%`
      : "0%";

  return {
    instalacoesAtivas: elevadoresFiltrados.length,
    custoMedioInstalacao,
    progressoMedioPrazo,
    taxaSatisfacao: parseFloat(taxaSatisfacao),
    instalacoesPais: paises,
    statusInstalacao,
  };
}

// Função auxiliar para ler o body da requisição
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      resolve(body);
    });
    req.on("error", (err) => {
      reject(err);
    });
  });
}

// Cria servidor
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

  console.log(`📥 Requisição: ${req.method} ${pathName}`, query);

  try {
    // 🔹 ROTA PATCH: Atualizar projeto (nota de qualidade)
    if (pathName.startsWith("/atualizar-projeto/") && req.method === "PATCH") {
      const projetoId = pathName.split("/")[2];

      console.log(`📝 Tentando atualizar projeto: ${projetoId}`);

      try {
        const body = await readBody(req);
        const { notaQualidade } = JSON.parse(body);

        console.log(`📊 Nova nota para projeto ${projetoId}: ${notaQualidade}`);

        // 🔹 Encontra o projeto pelo ID
        const projetoIndex = elevadores.findIndex(
          (projeto) => projeto.id === projetoId
        );

        if (projetoIndex === -1) {
          console.log(`❌ Projeto ${projetoId} não encontrado`);
          res.writeHead(404);
          res.end(
            JSON.stringify({
              success: false,
              error: "Projeto não encontrado",
            })
          );
          return;
        }

        // 🔹 Atualiza a nota de qualidade do projeto
        elevadores[projetoIndex].notaQualidade = notaQualidade;
        elevadores[projetoIndex].dataAvaliacao = new Date().toISOString();

        console.log(
          `✅ Projeto ${projetoId} atualizado com nota ${notaQualidade}`
        );

        // 🔹 Salva as alterações no arquivo (opcional)
        try {
          fs.writeFileSync(
            path.join(__dirname, "detalhe-pedido.json"),
            JSON.stringify(elevadores, null, 2),
            "utf-8"
          );
          console.log(
            `💾 Alterações salvas no arquivo para projeto ${projetoId}`
          );
        } catch (writeError) {
          console.log(
            "⚠️ Aviso: Não foi possível salvar no arquivo, mas os dados foram atualizados em memória"
          );
        }

        res.writeHead(200);
        res.end(
          JSON.stringify({
            success: true,
            message: "Projeto atualizado com sucesso",
            projeto: elevadores[projetoIndex],
          })
        );
      } catch (parseError) {
        console.error("❌ Erro ao processar requisição PATCH:", parseError);
        res.writeHead(400);
        res.end(
          JSON.stringify({
            success: false,
            error: "Dados inválidos",
          })
        );
      }

      // 🔹 ROTA USUÁRIOS: Buscar todos os usuários (clientes e funcionários) para login
    } else if (pathName === "/usuarios" && req.method === "GET") {
      // Combina clientes e funcionários em um único objeto
      const usuariosData = {
        clientes: clientesData.clientes,
        funcionarios: clientesData.funcionarios || [],
      };
      res.writeHead(200);
      res.end(JSON.stringify(usuariosData, null, 2));

      // 🔹 ROTA USUÁRIOS: Validar login
    } else if (pathName === "/login" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          const { email, senha, tipo } = JSON.parse(body);

          let usuario = null;

          if (tipo === "cliente") {
            usuario = clientesData.clientes.find(
              (cliente) => cliente.email === email && cliente.senha === senha
            );
          } else if (tipo === "funcionario") {
            usuario = clientesData.funcionarios.find(
              (funcionario) =>
                funcionario.email === email && funcionario.senha === senha
            );
          }

          if (usuario) {
            res.writeHead(200);
            res.end(
              JSON.stringify(
                {
                  success: true,
                  user: {
                    ...usuario,
                    tipo: tipo,
                  },
                },
                null,
                2
              )
            );
          } else {
            res.writeHead(401);
            res.end(
              JSON.stringify(
                {
                  success: false,
                  error: "E-mail ou senha incorretos.",
                },
                null,
                2
              )
            );
          }
        } catch (error) {
          console.error("Erro no login:", error);
          res.writeHead(500);
          res.end(
            JSON.stringify({
              success: false,
              error: "Erro interno do servidor",
            })
          );
        }
      });

      // 🔹 ROTA CLIENTES: Buscar dados do dashboard do cliente
    } else if (
      pathName === "/dashboard-cliente" &&
      req.method === "GET" &&
      query.clienteId
    ) {
      const cliente = clientesData.clientes.find(
        (c) => c.id === query.clienteId
      );

      if (!cliente) {
        res.writeHead(404);
        res.end(JSON.stringify({ erro: "Cliente não encontrado" }));
        return;
      }

      // Busca os projetos do cliente
      const projetosCliente = elevadores.filter((elevador) =>
        cliente.projetos.includes(elevador.id)
      );

      // Calcula métricas do dashboard
      const totalProjetos = projetosCliente.length;
      const projetosConcluidos = projetosCliente.filter(
        (p) =>
          p.status.toLowerCase().includes("concluído") ||
          p.status.toLowerCase().includes("concluida")
      ).length;
      const projetosAndamento = projetosCliente.filter(
        (p) =>
          p.status.toLowerCase().includes("fabricação") ||
          p.status.toLowerCase().includes("processo")
      ).length;
      const projetosAtrasados = projetosCliente.filter((p) =>
        p.status.toLowerCase().includes("atrasada")
      ).length;

      // Valor total dos contratos
      const valorTotalContratos = projetosCliente.reduce((total, projeto) => {
        return total + (projeto.custo || 0);
      }, 0);

      // Nota média de qualidade
      const projetosComNota = projetosCliente.filter(
        (p) => p.notaQualidade && p.notaQualidade > 0
      );
      const notaMedia =
        projetosComNota.length > 0
          ? (
              projetosComNota.reduce((sum, p) => sum + p.notaQualidade, 0) /
              projetosComNota.length
            ).toFixed(1)
          : 0;

      const dashboardCliente = {
        cliente: {
          id: cliente.id,
          nome: cliente.nome,
          empresa: cliente.empresa,
          email: cliente.email,
        },
        metricas: {
          totalProjetos,
          projetosConcluidos,
          projetosAndamento,
          projetosAtrasados,
          valorTotalContratos,
          notaMedia: parseFloat(notaMedia),
        },
        projetos: projetosCliente.map((projeto) => ({
          id: projeto.id,
          localizacao: projeto.localizacao,
          tipo: projeto.tipo,
          status: projeto.status,
          dataInicio: projeto.dataInicio,
          dataEntregaPrevista: projeto.dataEntregaPrevista,
          dataEntregaReal: projeto.dataEntregaReal,
          custo: projeto.custo,
          notaQualidade: projeto.notaQualidade,
          responsavelComercial: projeto.responsavelComercial,
          progresso: calcularProgressoProjeto(projeto),
        })),
      };

      res.writeHead(200);
      res.end(JSON.stringify(dashboardCliente, null, 2));

      // 🔹 ROTA CLIENTES: Buscar detalhes de um projeto específico
    } else if (
      pathName === "/projeto-cliente" &&
      req.method === "GET" &&
      query.projetoId &&
      query.clienteId
    ) {
      const cliente = clientesData.clientes.find(
        (c) => c.id === query.clienteId
      );

      if (!cliente) {
        res.writeHead(404);
        res.end(JSON.stringify({ erro: "Cliente não encontrado" }));
        return;
      }

      // Verifica se o projeto pertence ao cliente
      if (!cliente.projetos.includes(query.projetoId)) {
        res.writeHead(403);
        res.end(JSON.stringify({ erro: "Acesso negado a este projeto" }));
        return;
      }

      const projeto = elevadores.find((e) => e.id === query.projetoId);

      if (!projeto) {
        res.writeHead(404);
        res.end(JSON.stringify({ erro: "Projeto não encontrado" }));
        return;
      }

      res.writeHead(200);
      res.end(JSON.stringify(projeto, null, 2));

      // 🔹 Rota: Dashboard com filtros
    } else if (pathName === "/dashboardadmin" && req.method === "GET") {
      let elevadoresFiltrados = [...elevadores];

      // Aplica filtro de país
      if (query.pais && query.pais.trim() !== "") {
        elevadoresFiltrados = elevadoresFiltrados.filter((e) =>
          e.localizacao.toLowerCase().includes(query.pais.toLowerCase())
        );
      }

      // Aplica filtro de status
      if (query.status && query.status.trim() !== "") {
        elevadoresFiltrados = elevadoresFiltrados.filter((e) => {
          const statusLower = e.status.toLowerCase();
          const filterLower = query.status.toLowerCase();

          if (filterLower === "ativa") {
            return (
              statusLower.includes("fabricação") ||
              statusLower.includes("processo")
            );
          } else if (filterLower === "atrasada") {
            return statusLower.includes("atrasada");
          } else if (filterLower === "concluída") {
            return (
              statusLower.includes("concluído") ||
              statusLower.includes("concluida")
            );
          } else if (filterLower === "em teste") {
            return statusLower.includes("teste");
          }
          return true;
        });
      }

      // Aplica filtro de data de início
      if (query.dataInicio && query.dataInicio.trim() !== "") {
        elevadoresFiltrados = elevadoresFiltrados.filter((e) => {
          if (!e.dataInicio) return false;

          try {
            const dataElevador = new Date(e.dataInicio);
            const dataFiltro = new Date(query.dataInicio);

            dataElevador.setHours(0, 0, 0, 0);
            dataFiltro.setHours(0, 0, 0, 0);

            return dataElevador >= dataFiltro;
          } catch (error) {
            console.log(`Erro ao filtrar data para ${e.id}:`, error.message);
            return false;
          }
        });
      }

      // Aplica filtro de data fim
      if (query.dataFim && query.dataFim.trim() !== "") {
        elevadoresFiltrados = elevadoresFiltrados.filter((e) => {
          if (!e.dataInicio) return false;

          try {
            const dataElevador = new Date(e.dataInicio);
            const dataFiltro = new Date(query.dataFim);

            dataElevador.setHours(0, 0, 0, 0);
            dataFiltro.setHours(0, 0, 0, 0);

            return dataElevador <= dataFiltro;
          } catch (error) {
            console.log(`Erro ao filtrar data para ${e.id}:`, error.message);
            return false;
          }
        });
      }

      console.log(
        `✅ Filtros aplicados - País: "${query.pais}", Status: "${query.status}", Data Início: "${query.dataInicio}", Data Fim: "${query.dataFim}"`
      );
      console.log(`📊 Elevadores filtrados: ${elevadoresFiltrados.length}`);

      const dashboard = gerarDashboard(elevadoresFiltrados);
      res.writeHead(200);
      res.end(JSON.stringify(dashboard, null, 2));

      // 🔹 ROTA: Buscar todos os elevadores (com dados completos)
    } else if (pathName === "/buscar-vendas" && req.method === "GET") {
      const vendasCompleto = elevadores.map((e) => ({
        id: e.id,
        localizacao: e.localizacao,
        tipo: e.tipo,
        status: e.status,
        dataInicio: e.dataInicio,
        dataEntregaPrevista: e.dataEntregaPrevista,
        dataEntregaReal: e.dataEntregaReal,
        custo: e.custo,
        notaQualidade: e.notaQualidade,
        responsavelComercial: e.responsavelComercial,
        clienteNome: e.clienteNome,
      }));
      res.writeHead(200);
      res.end(JSON.stringify(vendasCompleto, null, 2));

      // 🔹 ROTA: Buscar elevadores filtrados para a tabela
    } else if (
      pathName === "/buscar-vendas-filtrados" &&
      req.method === "GET"
    ) {
      let elevadoresFiltrados = [...elevadores];

      // Aplica os mesmos filtros do dashboard
      if (query.pais && query.pais.trim() !== "") {
        elevadoresFiltrados = elevadoresFiltrados.filter((e) =>
          e.localizacao.toLowerCase().includes(query.pais.toLowerCase())
        );
      }

      if (query.status && query.status.trim() !== "") {
        elevadoresFiltrados = elevadoresFiltrados.filter((e) => {
          const statusLower = e.status.toLowerCase();
          const filterLower = query.status.toLowerCase();

          if (filterLower === "ativa") {
            return (
              statusLower.includes("fabricação") ||
              statusLower.includes("processo")
            );
          } else if (filterLower === "atrasada") {
            return statusLower.includes("atrasada");
          } else if (filterLower === "concluída") {
            return (
              statusLower.includes("concluído") ||
              statusLower.includes("concluida")
            );
          } else if (filterLower === "em teste") {
            return statusLower.includes("teste");
          }
          return true;
        });
      }

      // Aplica filtro de data de início
      if (query.dataInicio && query.dataInicio.trim() !== "") {
        elevadoresFiltrados = elevadoresFiltrados.filter((e) => {
          if (!e.dataInicio) return false;

          try {
            const dataElevador = new Date(e.dataInicio);
            const dataFiltro = new Date(query.dataInicio);

            dataElevador.setHours(0, 0, 0, 0);
            dataFiltro.setHours(0, 0, 0, 0);

            return dataElevador >= dataFiltro;
          } catch (error) {
            console.log(`Erro ao filtrar data para ${e.id}:`, error.message);
            return false;
          }
        });
      }

      // Aplica filtro de data fim
      if (query.dataFim && query.dataFim.trim() !== "") {
        elevadoresFiltrados = elevadoresFiltrados.filter((e) => {
          if (!e.dataInicio) return false;

          try {
            const dataElevador = new Date(e.dataInicio);
            const dataFiltro = new Date(query.dataFim);

            dataElevador.setHours(0, 0, 0, 0);
            dataFiltro.setHours(0, 0, 0, 0);

            return dataElevador <= dataFiltro;
          } catch (error) {
            console.log(`Erro ao filtrar data para ${e.id}:`, error.message);
            return false;
          }
        });
      }

      const vendasFiltradas = elevadoresFiltrados.map((e) => ({
        id: e.id,
        localizacao: e.localizacao,
        tipo: e.tipo,
        status: e.status,
        dataInicio: e.dataInicio,
        dataEntregaPrevista: e.dataEntregaPrevista,
        dataEntregaReal: e.dataEntregaReal,
        custo: e.custo,
        notaQualidade: e.notaQualidade,
        responsavelComercial: e.responsavelComercial,
        clienteNome: e.clienteNome,
      }));

      console.log(
        `📋 Retornando ${vendasFiltradas.length} elevadores filtrados para tabela`
      );
      res.writeHead(200);
      res.end(JSON.stringify(vendasFiltradas, null, 2));

      // 🔹 ROTA CLIENTES: Buscar todos os clientes
    } else if (pathName === "/clientes" && req.method === "GET") {
      res.writeHead(200);
      res.end(JSON.stringify(clientesData.clientes, null, 2));

      // 🔹 ROTA CLIENTES: Buscar cliente por ID
    } else if (pathName === "/cliente" && req.method === "GET" && query.id) {
      const cliente = clientesData.clientes.find((c) => c.id === query.id);

      if (cliente) {
        res.writeHead(200);
        res.end(JSON.stringify(cliente, null, 2));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ erro: "Cliente não encontrado" }));
      }

      // 🔹 ROTA CLIENTES: Buscar cliente por email (para login)
    } else if (
      pathName === "/cliente-login" &&
      req.method === "GET" &&
      query.email
    ) {
      const cliente = clientesData.clientes.find(
        (c) => c.email === query.email
      );

      if (cliente) {
        res.writeHead(200);
        res.end(JSON.stringify(cliente, null, 2));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ erro: "Cliente não encontrado" }));
      }

      // 🔹 ROTA CLIENTES: Buscar projetos de um cliente
    } else if (
      pathName === "/cliente-projetos" &&
      req.method === "GET" &&
      query.clienteId
    ) {
      const cliente = clientesData.clientes.find(
        (c) => c.id === query.clienteId
      );

      if (cliente) {
        const projetosCliente = elevadores.filter((elevador) =>
          cliente.projetos.includes(elevador.id)
        );
        res.writeHead(200);
        res.end(JSON.stringify(projetosCliente, null, 2));
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ erro: "Cliente não encontrado" }));
      }
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ erro: "Rota não encontrada" }));
    }
  } catch (error) {
    console.error("❌ Erro no servidor:", error);
    res.writeHead(500);
    res.end(JSON.stringify({ erro: "Erro interno do servidor" }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
  console.log(`📊 Total de elevadores carregados: ${elevadores.length}`);
  console.log(
    `👥 Total de clientes carregados: ${clientesData.clientes.length}`
  );
  console.log(
    `👨‍💼 Total de funcionários carregados: ${
      clientesData.funcionarios?.length || 0
    }`
  );
  console.log(`🌐 Rotas disponíveis:`);
  console.log(`   - GET  /dashboardadmin`);
  console.log(`   - GET  /dashboard-cliente`);
  console.log(`   - GET  /buscar-vendas`);
  console.log(`   - GET  /buscar-vendas-filtrados`);
  console.log(`   - POST /login`);
  console.log(`   - GET  /usuarios`);
  console.log(`   - GET  /clientes`);
  console.log(`   - PATCH /atualizar-projeto/:id`); // ← NOVA ROTA ADICIONADA
});
