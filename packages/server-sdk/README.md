# @anase/server-sdk

The SDK for cliet-side code to connect to the server-side components.

## Usage

```shell
ni @anase/server-sdk -D # from @antfu/ni, can be installed via `npm i -g @antfu/ni`
pnpm i @anase/server-sdk -D
yarn i @anase/server-sdk -D
npm i @anase/server-sdk -D
```

```typescript
import { Client } from '@anase/server-sdk'

const c = new Client({ name: 'your airi plugin' })
```

## License

[MIT](../../LICENSE)
