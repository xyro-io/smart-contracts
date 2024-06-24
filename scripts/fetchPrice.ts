const url = "https://backend-web3.xyro.io/graphql";

export async function getPrice() {
  let bodyContent = JSON.stringify({
    query: `query ListAssets {
        listAssets {
          id
          name
          price {
            formattedValue
          }
        }
      }`,
  });
  const response = await fetch(url, {
    method: "POST",
    body: bodyContent,
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json();
  const price = Math.floor(data.data.listAssets[1].price.formattedValue);
  return price;
}

export async function getPayload() {
  let bodyContent = JSON.stringify({
    query: `query ListAssets {
        listAssets {
          id
          name
          price {
            payload
          }
        }
      }`,
  });
  const response = await fetch(url, {
    method: "POST",
    body: bodyContent,
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json();
  return data.data.listAssets[1].price.payload;
}
