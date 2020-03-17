import 'core-js/modules/esnext.promise.any.js'
import Block from '../../Block.js'
import {
  Worker
} from 'worker_threads'
import chai from 'chai'
import crypto from 'crypto'
import proofOfWorfk from './proof_of_work2.js'

const { assert } = chai

function randomId() {
  return crypto.randomBytes(16).toString("hex")
}

describe('Proof of work (2)', () => {
  it('Calls proof of work with low difficulty', () => {
    const block = new Block(1, randomId(), [], 2)
    proofOfWorfk(block, ''.padStart(block.difficulty, '0'))
    assert.isOk(block.nonce > 0)
  })

  it('Calls proof of work async', () => {
    const block = new Block(1, randomId(), [], 3)
    const ret = proofOfWorkAsync(block)
      .then(noncedBlock => {
        assert.isOk(noncedBlock.nonce > 0)
      })
    assert.equal(block.nonce, 0)
    return ret
  })

  it('Run two proof of work in parallel', () => {
    return Promise.all([
      proofOfWorkAsync(new Block(1, randomId(), [], 1)),
      proofOfWorkAsync(new Block(2, randomId(), [], 4))
    ])
      .then(([blockDiff1, blockDiff2]) => {
        assert.isOk(blockDiff1.nonce > 0)
        assert.isOk(blockDiff2.nonce > 0)
        assert.isOk(blockDiff1.nonce < blockDiff2.nonce)
      })
  }).timeout(10_000)


  it('Race two proof of work', () => {
    return Promise.race([
      proofOfWorkAsync(new Block(1, randomId(), [], 1)),
      proofOfWorkAsync(new Block(2, randomId(), [], 4))
    ])
      .then(blockWinner => {
        assert.isOk(blockWinner.nonce > 0)
        assert.equal(blockWinner.index, 1)
      })
  })

  it('Get fastest result', () => {
    const block = new Block(1, randomId(), [], 6)
    return Promise.race([
      proofOfWorkAsync(block),
      ignoreAfter(2)
    ])
      .then(() => {
        assert.isOk(block.nonce > 0)
        assert.equal(block.difficulty, 6)
        assert.isOk(block.hash.startsWith('000000'))
      }, cancellationError => {
        assert.equal(cancellationError.message, 'Operation timed out after 2 seconds')
      })
  }).timeout(10_000)


  it('Promise.allSettled', () => {
    const block = new Block(1, randomId(), [], 2)
    return Promise.allSettled([
      proofOfWorkAsync(block),
      rejectAfter(2)
    ])
      .then(results => {
        assert.equal(results.length, 2)
        assert.equal(results[0].status, 'fulfilled')
        assert.equal(results[1].status, 'rejected')
        assert.equal(results[0].value.index, 1)
        assert.isUndefined(results[1].value)
        assert.equal(results[1].reason.message, 'Operation rejected after 2 seconds')
      })
  }).timeout(5000)

  it('Promise.any with value', () => {
    return Promise.any([
      proofOfWorkAsync(new Block(1, randomId(), ['a', 'b', 'c'], 1)),
      rejectAfter(2)
    ])
      .then(block => {
        assert.equal(block.index, 1)
        assert.equal(block.difficulty, 1)
      })
  })

  // it('Promise.any with rejection', () => {
  //   return Promise.any([
  //     Promise.reject(new Error('Error 1')),
  //     Promise.reject(new Error('Error 2'))
  //   ])
  //     .catch(aggregateError => {
  //       assert.equal(aggregateError.errors.length, 200)
  //     })
  //     .then(() => { })
  // }).timeout(10_000)

  it('Async Iter (3 tasks)', async () => {
    const tasks = [
      proofOfWorkAsync(new Block(1, randomId(), [], 2)),
      proofOfWorkAsync(new Block(2, randomId(), [], 2)),
      proofOfWorkAsync(new Block(2, randomId(), [], 2))
    ]
    for await (const minedBlock of tasks) {
      assert.isOk(minedBlock.hash.startsWith('00'))
    }
  }).timeout(15_000)
})

function ignoreAfter(seconds) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${seconds} seconds`))
    }, seconds * 1_000)
  })
}

function rejectAfter(seconds) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation rejected after ${seconds} seconds`))
    }, seconds * 1_000)
  })
}

function proofOfWorkAsync(block) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./src/domain/service/jslcoinservice/proof_of_work.worker.js', {
      workerData: block
    });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0)
        reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}