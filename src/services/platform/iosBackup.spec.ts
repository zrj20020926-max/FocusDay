import { beforeEach, expect, it, vi } from 'vitest'

const { writeFile, deleteFile, share } = vi.hoisted(() => ({
  writeFile: vi.fn(),
  deleteFile: vi.fn(),
  share: vi.fn(),
}))
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' }, Filesystem: { writeFile, deleteFile },
}))
vi.mock('@capacitor/share', () => ({ Share: { share } }))
import { shareIOSBackup } from './iosBackup'

const filename = 'focus-day-backup-2026-11-26.json'
const uri = 'file:///cache/' + filename

beforeEach(() => {
  vi.resetAllMocks()
  writeFile.mockResolvedValue({ uri })
  deleteFile.mockResolvedValue(undefined)
})

it('shares the UTF-8 backup as a file and removes the private cache copy', async () => {
  share.mockResolvedValue({ activityType: 'com.apple.DocumentManager' })
  const json = '{"title":"今日任务"}'
  await expect(shareIOSBackup(filename, json)).resolves.toBe(true)
  expect(writeFile).toHaveBeenCalledWith({ path: filename, directory: 'CACHE', encoding: 'utf8', data: json })
  expect(share).toHaveBeenCalledWith(expect.objectContaining({ files: [uri] }))
  expect(deleteFile).toHaveBeenCalledWith({ path: filename, directory: 'CACHE' })
})

it('cleans up on cancellation and reports unexpected failures', async () => {
  share.mockRejectedValueOnce(new Error('Share canceled')).mockRejectedValueOnce(new Error('Share unavailable'))
  await expect(shareIOSBackup(filename, '{}')).resolves.toBe(false)
  await expect(shareIOSBackup(filename, '{}')).rejects.toThrow('Share unavailable')
  expect(deleteFile).toHaveBeenCalledTimes(2)
})
