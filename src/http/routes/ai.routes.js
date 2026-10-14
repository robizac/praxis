'use strict';

const express = require('express');
const { config } = require('../../config/env');
const providers = require('../../services/ai/providers');
const usageService = require('../../services/usageService');
const credentialsRepo = require('../../repositories/aiCredentials.repo');
const { encryptSecret, last4 } = require('../../integrations/crypto');
const { BadRequestError } = require('../../domain');

const router = express.Router();

const BYOK_PROVIDERS = providers.SUPPORTED;

router.get('/ai/usage', async (req, res, next) => {
  try {
    const planId = req.user.plan || 'free';
    const [quota, costToday, cred] = await Promise.all([
      usageService.getQuota(req.user.id, planId),
      usageService.costTodayUsd(),
      credentialsRepo.getByUser(req.user.id)
    ]);

    res.json({
      ...quota,
      byokActive: Boolean(cred && cred.status === 'active'),
      provider: cred ? cred.provider : null,
      costTodayUsd: Number(Number(costToday || 0).toFixed(6)),
      supportedProviders: BYOK_PROVIDERS
    });
  } catch (error) {
    next(error);
  }
});

router.get('/ai/credentials', async (req, res, next) => {
  try {
    const cred = await credentialsRepo.getByUser(req.user.id);
    res.json({ credential: credentialsRepo.toPublic(cred) });
  } catch (error) {
    next(error);
  }
});

router.put('/ai/credentials', async (req, res, next) => {
  try {
    const provider = String(req.body?.provider || '').trim().toLowerCase();
    const apiKey = String(req.body?.apiKey || '').trim();
    const model = String(req.body?.model || '').trim() || null;
    const baseUrl = String(req.body?.baseUrl || '').trim() || null;

    if (!providers.isSupported(provider)) {
      throw new BadRequestError(`Provider inválido. Use: ${BYOK_PROVIDERS.join(', ')}.`);
    }

    if (provider !== 'ollama' && apiKey.length < 8) {
      throw new BadRequestError('Informe uma chave de API válida.');
    }

    // Validação com uma chamada de teste barata (docs/09, 9.6).
    // Em ambiente de teste a chamada é ignorada para manter os testes determinísticos.
    if (config.nodeEnv !== 'test') {
      try {
        await providers.generate(provider, {
          input: 'validação de credencial',
          area: 'Identidade',
          apiKey: apiKey || undefined,
          model: model || undefined,
          baseUrl: baseUrl || undefined
        });
      } catch (error) {
        throw new BadRequestError(
          `Não foi possível validar a credencial: ${error.message || 'falha no provider.'}`
        );
      }
    }

    // Ollama pode não ter chave; guardamos um marcador local (coluna é NOT NULL).
    const secret = apiKey || `local:${baseUrl || config.ai.ollamaBaseUrl}`;
    const encrypted = encryptSecret(secret);

    const row = await credentialsRepo.upsert(req.user.id, {
      provider,
      keyCiphertext: encrypted.ciphertext,
      keyIv: encrypted.iv,
      keyTag: encrypted.tag,
      keyLast4: apiKey ? last4(apiKey) : null,
      baseUrl,
      model,
      status: 'active'
    });

    res.status(201).json({ credential: credentialsRepo.toPublic(row) });
  } catch (error) {
    next(error);
  }
});

router.delete('/ai/credentials', async (req, res, next) => {
  try {
    const changes = await credentialsRepo.deleteByUser(req.user.id);
    res.json({ ok: true, removed: changes > 0 });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
