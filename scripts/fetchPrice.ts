export async function getPrice() {
  let bodyContent = JSON.stringify({
    query: `query ListAssets {
        listAssets {
          id
          name
          price {
            price
          }
        }
      }`,
  });
  const response = await fetch("https://backend-dev.xyro.io/graphql", {
    method: "POST",
    body: bodyContent,
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json();
  const price = data.data.listAssets[0].price.price.toString().replace(".", "");
  return price;
}
