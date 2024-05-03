// export async function getRequest<T>(
//   gqlBody: any,
//   //   token?: string | null,
//   key?: string
// ) {
//   let headersList: any = {
//     "Content-Type": "application/json",
//   };
//   // if (token) {
//   //   // headersList["Authorization"] = `Bearer ${token}`;
//   //   headersList["Cookie"] = `${token}`;
//   // }

//   try {
//     let bodyContent = JSON.stringify(gqlBody);
//     const response = await fetch(config.GRAPH_URL, {
//       method: "POST",
//       body: bodyContent,
//       headers: headersList,
//     });

//     const data = await response.json();
//     const headers = response.headers;

//     if (data.errors?.length > 0) {
//       for (const err of data.errors) {
//         log(gqlBody);
//         // log(err);
//         log(err.message);
//       }

//       return null;
//     }

//     const cookie = parseCookies(headers.getSetCookie());
//     if (cookie) {
//       return cookie;
//     }

//     if (key && data?.data?.[key]) {
//       return data?.data[key] as T;
//     }
//     return data as T;
//   } catch (e) {
//     console.log(config.GRAPH_URL);
//     console.error(e);

//     log(gqlBody);
//   }
// }

async function check() {
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
  console.log(data.data.listAssets[0].price.price.toString().replace(".", ""));
}

check();
