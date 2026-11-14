// Compatibility projection for fields whose canonical dataset representation
// is wider than the stable /api/v1/ contract.

export const toApiV1Provider = (provider) => provider.commercial_ok === 'conditional'
  ? { ...provider, commercial_ok: null }
  : provider;

export const toApiV1ChangeValue = (field, value) => field === 'commercial_ok' && value === 'conditional'
  ? null
  : value;
