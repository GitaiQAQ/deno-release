#!/usr/bin/env zx

import assert from 'assert';

const isProduction = ($.env.NODE_ENV || "").startsWith("prod");

async function getReleaseDownloadURLs(version = "latest") {
  const release = await (
    await fetch(
      `https://api.github.com/repos/denoland/deno/releases/${version}`
    )
  ).json();

  if (release.tag_name) {
    const { tag_name, assets: _assets } = release;
    const version = tag_name.substring(1);
    const assets = Object.fromEntries(
      _assets
        .filter((asset) => asset.content_type === "application/zip")
        .map((asset) => {
          const { name: zip_name, browser_download_url } = asset;
          const dir_name = zip_name.replace(".zip", "");
          return [dir_name, browser_download_url];
        })
    );

    return {
      version,
      assets,
    };
  }
}

const pkgMap = {
  "deno-aarch64-apple-darwin": {
    files: ["bin/deno"],
    os: ["darwin"],
    cpu: ["arm"],
  },
  "deno-x86_64-apple-darwin": {
    files: ["bin/deno"],
    os: ["darwin"],
    cpu: ["x64"],
  },
  "deno-x86_64-pc-windows-msvc": {
    files: ["bin/deno.exe"],
    os: ["win32"],
    cpu: ["x64"],
  },
  "deno-x86_64-unknown-linux-gnu": {
    files: ["bin/deno"],
    os: ["linux"],
    cpu: ["x64"],
  },
};

function getPkgTemplate(version, names) {
  return {
    name: "@bin-release/deno",
    version,
    description:
      "CLI wrapper for Deno, a secure runtime for JavaScript and TypeScript",
    keywords: ["deno"],
    bin: {
      deno: "bin/deno.exe",
    },
    files: ["bin/deno.exe"].concat(isProduction ? [] : ['*.tgz']),
    scripts: {
      preinstall:
        "mv node_modules/@bin-release/deno-*/bin/deno ./bin/deno.exe || mv ../deno-*/bin/deno ./bin/deno.exe",
    },
    author: "Gitai<i@gitai.me>",
    license: "MIT",
    dependencies: {},
    optionalDependencies: Object.fromEntries(
      names.map((name) => [
        `@bin-release/${name}`,
        isProduction
          ? version
          : `file:bin-release-${name}-${version}.tgz`,
      ])
    ),
  };
}

function getAssetPkgTemplate(version, name) {
  return {
    name: `@bin-release/${name}`,
    version: version,
    author: "Gitai<i@gitai.me>",
    license: "MIT",
    ...(pkgMap[name] || {}),
  };
}

function getTestPkg(version = '1.0.0') {
  return {
    "name": "test",
    "version": "1.0.0",
    "description": "",
    "author": "",
    "license": "MIT",
    "dependencies": {
      "@bin-release/deno": `file:bin-release-deno-${version}.tgz`
    }
  }

}

async function build() {
  // const { version, assets } = getReleaseDownloadURLs();
  const { version, assets } = {
    version: "1.0.0",
    assets: {
      // "deno-aarch64-apple-darwin":
      //   "https://github.com/denoland/deno/releases/download/v1.0.0/deno-aarch64-apple-darwin.zip",
      // "deno-x86_64-apple-darwin":
      //   "https://github.com/denoland/deno/releases/download/v1.0.0/deno-x86_64-apple-darwin.zip",
      "deno-x86_64-pc-windows-msvc":
        "https://github.com/denoland/deno/releases/download/v1.0.0/deno-x86_64-pc-windows-msvc.zip",
      // "deno-x86_64-unknown-linux-gnu":
      //   "https://github.com/denoland/deno/releases/download/v1.0.0/deno-x86_64-unknown-linux-gnu.zip",
    },
  };

  await within(async () => {
    await cd("deno");
    await fs.writeJson(
      "./package.json",
      getPkgTemplate(version, Object.keys(assets)),
      { spaces: 2 }
    );
  });

  for (const name in assets) {
    if (Object.hasOwnProperty.call(assets, name)) {
      const download_url = assets[name];
      await within(async () => {
        await $`mkdir -p "${name}/bin"`;
        await cd(name);
        await fs.writeJson(
          "./package.json",
          getAssetPkgTemplate(version, name),
          { spaces: 2 }
        );
        // await $`curl --fail --location --progress-bar --output "${name}.zip" "${download_url}"`;
        // await $`unzip -d "./bin" -o "${name}" && chmod +x "./bin/deno"`;
        // fs.remove(`${name}.zip`);
      });
    }
  }
}

async function test(version = '1.0.0', name = "deno-x86_64-pc-windows-msvc") {
  await within(async () => {
    await cd(name);
    await $`npm pack --pack-destination=../deno`;
  });

  await within(async () => {
    await cd("deno");
    await $`npm pack --pack-destination=../test`;
    if (!isProduction) {
      await $`cp ./*.tgz ../test`;
    }
  });

  await within(async () => {
    await cd("test");
    await fs.writeJson(
      "./package.json",
      getTestPkg(version),
      { spaces: 2 }
    );
    await $`rm -rf node_modules *lock* *lock`;
    {
      await $`npm cache clean --force && npm install`;
      assert.equal((await $`npx deno --version`).toString().split('\n')[0], `deno 1.30.0 (release, x86_64-pc-windows-msvc)`)
    }
    {
      // unsupported pkg management
      // await $`yarn cache clean && yarn install && yarn deno --version`
    }
    {
      // await $`pnpm install && pnpm deno --version`;
      // assert.equal((await $`npx deno --version`).toString().split('\n')[0], `deno ${version} (release, x86_64-pc-windows-msvc)`)
    }
  });
}

build();

test('1.30.0');