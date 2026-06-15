const https = require("https");

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let nome;
  try {
    nome = JSON.parse(event.body).nome;
    if (!nome) throw new Error("Nome em falta");
  } catch(e) {
    return { statusCode: 400, body: "Pedido inválido: " + e.message };
  }

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) {
    return { statusCode: 500, body: "Chave API não configurada. Adiciona ANTHROPIC_API_KEY nas variáveis de ambiente do Netlify." };
  }

  const prompt =
    `Analisa o ingrediente alimentar: "${nome}"\n\n` +
    `Responde APENAS com JSON puro, sem markdown, sem texto extra:\n` +
    `{\n` +
    `  "grupo_nova": "1",\n` +
    `  "alergenios": ["leite","gluten"],\n` +
    `  "vestigios": ["frutos_c"],\n` +
    `  "nutrientes_100g": {\n` +
    `    "kcal": 52, "carb": 11.4, "acucares": 10.2,\n` +
    `    "gorduras": 0.2, "saturadas": 0.03,\n` +
    `    "proteinas": 0.3, "sal": 0.001, "fibra": 2.4\n` +
    `  },\n` +
    `  "nome_pt": "${nome}"\n` +
    `}\n\n` +
    `grupo_nova: "1"=nao processado (frutas frescas, vegetais crus, carne fresca, ovos, leguminosas secas), ` +
    `"2"=minimamente processado (congelados simples, leite pasteurizado, farinhas, arroz, azeite, sal, mel), ` +
    `"3"=processado (queijo, pao, conservas, fumados, enlatados, vinho, enchidos), ` +
    `"4"=ultra-processado (refrigerantes, nuggets, bolachas industriais, salsichas).\n` +
    `alergenios e vestigios: usa apenas estes IDs: gluten, crustaceos, ovos, peixe, amendoins, soja, leite, frutos_c, aipo, mostarda, sesamo, sulfitos, tremocos, moluscos.\n` +
    `nutrientes_100g: valores medios por 100g. Todos os 8 campos sao obrigatorios: kcal, carb, acucares, gorduras, saturadas, proteinas, sal, fibra. Usa numeros com ponto decimal.`;

  const payload = JSON.stringify({
    model: "claude-sonnet-4-6",
    max_tokens: 600,
    messages: [{ role: "user", content: prompt }]
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Length": Buffer.byteLength(payload)
        }
      };
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", chunk => { data += chunk; });
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      });
      req.on("error", reject);
      req.write(payload);
      req.end();
    });

    if (result.status !== 200) {
      return { statusCode: 502, body: "Erro API Anthropic: " + result.body };
    }

    const apiData = JSON.parse(result.body);
    const txt = apiData.content?.[0]?.text || "";
    const clean = txt.replace(/```[\w]*\n?/g, "").trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { statusCode: 502, body: "Resposta inesperada: " + clean.substring(0, 100) };
    const parsed = JSON.parse(jsonMatch[0]);

    const nutri = parsed.nutrientes_100g || {};
    ["kcal","carb","acucares","gorduras","saturadas","proteinas","sal","fibra"].forEach(k => {
      if (nutri[k] === undefined) nutri[k] = 0;
    });
    parsed.nutrientes_100g = nutri;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed)
    };
  } catch(e) {
    return { statusCode: 500, body: "Erro: " + e.message };
  }
};
