
const overpass = require('../services/overpassService');

const originalFetch = global.fetch;

const pharmacy = {
  type: 'node',
  id: 12345,
  lat: 12.9716,
  lon: 77.5946,
  tags: {
    amenity: 'pharmacy',
    name: 'Test Pharmacy'
  }
};

const response = (status, elements = []) => ({
  ok: status >= 200 && status < 300,
  status,
  json: jest.fn().mockResolvedValue({ elements })
});

describe('Overpass pharmacy lookup', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('returns mapped pharmacies when primary endpoint succeeds', async () => {
    global.fetch.mockResolvedValue(response(200, [pharmacy]));

    const result = await overpass.queryPharmacies(
      12.9716, 77.5946, 300
    );

    expect(result).toHaveLength(1);
    expect(result[0].pharmacy_name).toBe('Test Pharmacy');
    expect(result[0].coordinates).toEqual({
      lat: 12.9716,
      lon: 77.5946
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];

expect(url).toBe(
  'https://overpass.private.coffee/api/interpreter'
);

expect(options.method).toBe('POST');

expect(options.headers['Content-Type']).toContain(
  'application/x-www-form-urlencoded'
);

expect(options.body).toBeInstanceOf(URLSearchParams);

expect(options.body.get('data')).toContain(
  'node["amenity"="pharmacy"]'
);

expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  test('uses fallback when primary endpoint fails', async () => {
    global.fetch
      .mockResolvedValueOnce(response(500))
      .mockResolvedValueOnce(response(200, [pharmacy]));

    const result = await overpass.queryPharmacies(
      12.9716, 77.5946, 300
    );

    expect(result).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toContain(
      'overpass-api.de'
    );
  });

  test('throws when both endpoints fail', async () => {
    global.fetch
      .mockResolvedValueOnce(response(500))
      .mockResolvedValueOnce(response(503));

    await expect(
      overpass.queryPharmacies(12.9716, 77.5946, 300)
    ).rejects.toThrow('All Overpass endpoints failed');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('uses fallback after a network error', async () => {
    global.fetch
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce(response(200, [pharmacy]));

    const result = await overpass.queryPharmacies(
      12.9716, 77.5946, 300
    );

    expect(result).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
  test('accepts numeric-string coordinates in cached searches', async () => {
  global.fetch.mockResolvedValue(response(200, [pharmacy]));

  const result = await overpass.queryNearbyCached(
    '12.9716',
    '77.5946',
    '300'
  );

  expect(result).toHaveLength(1);
  expect(result[0].pharmacy_name).toBe('Test Pharmacy');
  expect(global.fetch).toHaveBeenCalledTimes(1);

  const [url, options] = global.fetch.mock.calls[0];

  expect(url).toContain('overpass.private.coffee');
  expect(options.method).toBe('POST');
});
test('rejects invalid coordinates and radius without calling Overpass', async () => {
  const invalidInputs = [
    [91, 77.5946, 300],
    [-91, 77.5946, 300],
    [12.9716, 181, 300],
    [12.9716, -181, 300],
    ['invalid', 77.5946, 300],
    [12.9716, 77.5946, 0],
    [12.9716, 77.5946, -100],
    [12.9716, 77.5946, 50001],
    [12.9716, 77.5946, 'invalid']
  ];

  for (const [lat, lon, radius] of invalidInputs) {
    await expect(
      overpass.queryPharmacies(lat, lon, radius)
    ).rejects.toThrow();
  }

  expect(global.fetch).not.toHaveBeenCalled();
});

test('rejects invalid cached searches without calling Overpass', async () => {
  await expect(
    overpass.queryNearbyCached(91, 77.5946, 300)
  ).rejects.toThrow('Invalid latitude');

  await expect(
    overpass.queryNearbyCached(12.9716, 181, 300)
  ).rejects.toThrow('Invalid longitude');

  await expect(
    overpass.queryNearbyCached(12.9716, 77.5946, -100)
  ).rejects.toThrow('Invalid radius');

  expect(global.fetch).not.toHaveBeenCalled();
});

});

describe('Overpass OSM element lookup', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('returns a mapped element when the primary endpoint succeeds', async () => {
    global.fetch.mockResolvedValue(response(200, [pharmacy]));

    const result = await overpass.getElementById(12345);

    expect(result.pharmacy_name).toBe('Test Pharmacy');
    expect(result.osm_id).toBe(12345);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('overpass.private.coffee');
    expect(options.method).toBe('POST');
    expect(options.body.get('data')).toContain('node(12345)');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  test('uses fallback when the primary endpoint fails', async () => {
    global.fetch
      .mockResolvedValueOnce(response(500))
      .mockResolvedValueOnce(response(200, [pharmacy]));

    const result = await overpass.getElementById(12345);

    expect(result.pharmacy_name).toBe('Test Pharmacy');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toContain('overpass-api.de');
  });

  test('returns null when no element is found', async () => {
    global.fetch.mockResolvedValue(response(200, []));

    const result = await overpass.getElementById(12345);

    expect(result).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('rejects invalid OSM IDs without making a request', async () => {
    await expect(
      overpass.getElementById('123;out;')
    ).rejects.toThrow('Invalid OSM element ID');

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('throws when both endpoints fail', async () => {
    global.fetch
      .mockResolvedValueOnce(response(500))
      .mockResolvedValueOnce(response(503));

    await expect(
      overpass.getElementById(12345)
    ).rejects.toThrow('All Overpass endpoints failed');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
