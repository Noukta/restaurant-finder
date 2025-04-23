const sendRequest = async <
  T = Record<string, unknown>,
  P = object
>(
  endPoint: string,
  method: string = 'GET',
  payload: P | null = null,
  token: string | null = null
): Promise<T> => {

  const fetchOptions: RequestInit = {
    method,
    headers: { 'Authorization': `Bearer ${token}` },
    credentials: 'include'
  };

  if (method !== 'GET' && payload !== null) {
    if (payload instanceof FormData) {
      fetchOptions.body = payload;
    } else {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        'Content-Type': 'application/json'
      };
      fetchOptions.body = JSON.stringify(payload);
    }
  }

  const req: Response = await fetch(`${import.meta.env.VITE_SERVER_URL}/${endPoint}`, fetchOptions);
  const res = await req.json();

  if (!req.ok) {
    const error = new Error(res.message || 'Could not fetch Data!');
    throw error;
  }

  return res;
};

export default sendRequest;