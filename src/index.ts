import { Toolkit } from 'actions-toolkit'
import { ReadmeBox } from 'readme-box'
import Parser from 'rss-parser'
import mustache from 'mustache'

const parser = new Parser()

interface Inputs {
  'feed-url': string
  'readme-section': string
  'empty-commits': string
  max: string
  template: string
  branch: string
  [key: string]: string
}

async function getReadme(tools: Toolkit, branch: string, path: string) {
  const { data } = await tools.github.request('GET /repos/:owner/:repo/contents/:path', {
    ...tools.context.repo,
    ref: branch,
    path
  })

  // The API returns the blob as base64 encoded, we need to decode it
  const encoded = data.content
  const decoded = Buffer.from(encoded, 'base64').toString('utf8')

  return {
    content: decoded,
    sha: data.sha,
    path: data.path
  }
}

Toolkit.run<Inputs>(async tools => {
  // Fetch feed
  const feed = await parser.parseURL(tools.inputs['feed-url'])

  if (!feed.items) {
    throw new Error('feed.items was not found!')
  }

  // Create our new list
  const newString = feed.items
    .slice(0, parseInt(tools.inputs.max, 10)) 
    .map(item => mustache.render(tools.inputs.template, item)).join('\n')

  const emptyCommits = tools.inputs['empty-commits'] !== 'false'
  const branch = tools.inputs.branch || tools.context.payload.repository?.default_branch

  // Update the section of our README
  const box = new ReadmeBox({
    ...tools.context.repo,
    token: tools.token,
    branch: tools.inputs.branch || tools.context.payload.repository?.default_branch
  })

  // Get the README
  const { content: oldContents, sha, path } = await getReadme(tools, box.branch, tools.inputs.path || 'README.md')

  // Replace the old contents with the new
  const replaced = box.replaceSection({
    section: tools.inputs['readme-section'],
    oldContents,
    newContents: newString
  })

  if (emptyCommits !== true && oldContents === replaced) {
    return
  }

  // Actually update the README
  return box.updateReadme({
    content: replaced,
    branch,
    sha,
    path
  })
})
