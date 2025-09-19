const { enqueueGids } = require('./bulk-helper');

(async () => {
  try {
    const blogGids = await listAllBlogGids();
    await enqueueGids('blog', blogGids, 'bulk-blogs');
    const articleGids = await listAllArticleGids();
    await enqueueGids('article', articleGids, 'bulk-articles');
    process.exit(0);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  }
})();
