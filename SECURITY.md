# Security

Please report a vulnerability privately to **info@nodegrove.io** rather than in a public issue. You will get a reply within three working days.

What the server can and cannot do, so you can judge a report's reach:

- All six tools are read-only. There is no authentication, no user data, no database and nothing written anywhere.
- Nodegrove keeps no request logs and no record of tool arguments from the remote endpoint (`mcp.nodegrove.io`); Cloudflare keeps standard edge logs briefly, as for any website. Each request is answered by a fresh, stateless server instance and rate-limited per address.
- The only outbound requests either entry point makes are to `huggingface.co`, for the public `config.json` and metadata of a repo the caller names.
