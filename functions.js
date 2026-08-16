export default {
  async fetch(request) {
    return Response.json({
      ok: true,
      name: "pg-typestorm",
      path: new URL(request.url).pathname,
    });
  },
};
